"use client";

import Link from "next/link";
import { Excalidraw, THEME } from "@excalidraw/excalidraw";
import { startTransition, useEffect, useRef, useState } from "react";

import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import { SaveIndicator } from "./SaveIndicator";
import { serializeSceneForDatabase } from "./serialize-scene";
import { syncProjectThumbnail } from "./thumbnail";

import {
  isLocalBinaryFile,
  type EditorProjectPayload,
} from "@/lib/project-scene";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
type SceneElements = NonNullable<ExcalidrawInitialDataState["elements"]>;

const SAVE_DEBOUNCE_MS = 800;
const THUMBNAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const useEvent = <T extends (...args: any[]) => any>(handler: T) => {
  const handlerRef = useRef(handler);
  const stableHandlerRef = useRef<T | null>(null);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  if (!stableHandlerRef.current) {
    stableHandlerRef.current = ((...args: Parameters<T>) =>
      handlerRef.current(...args)) as T;
  }

  return stableHandlerRef.current as T;
};

export function ProjectCanvas({ project }: { project: EditorProjectPayload }) {
  const [saveState, setSaveState] = useState<SaveState>(
    project.lastSavedAt ? "saved" : "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    project.lastSavedAt,
  );
  const [error, setError] = useState<string | null>(null);
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  const hasReceivedInitialChangeRef = useRef(false);
  const latestElementsRef = useRef<SceneElements>(project.initialData.elements);
  const latestAppStateRef = useRef<AppState | null>(null);
  const latestFilesRef = useRef<BinaryFiles>(project.initialData.files);
  const revisionRef = useRef(project.revision);
  const saveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const lastThumbnailAtRef = useRef(Date.now());
  const uploadingAssetIdsRef = useRef(new Set<string>());
  const uploadedAssetIdsRef = useRef(
    new Set(
      Object.entries(project.initialData.files)
        .filter(([, file]) => !isLocalBinaryFile(file))
        .map(([fileId]) => fileId),
    ),
  );

  const updateState = (next: SaveState, nextError?: string | null) => {
    startTransition(() => {
      setSaveState(next);
      setError(nextError ?? null);
    });
  };

  const uploadPendingAssets = useEvent(async (files: BinaryFiles) => {
    for (const [fileId, file] of Object.entries(files) as [
      string,
      BinaryFileData,
    ][]) {
      if (
        !isLocalBinaryFile(file) ||
        uploadedAssetIdsRef.current.has(fileId) ||
        uploadingAssetIdsRef.current.has(fileId)
      ) {
        continue;
      }

      uploadingAssetIdsRef.current.add(fileId);

      try {
        const response = await fetch(`/api/projects/${project.id}/assets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileId,
            mimeType: file.mimeType,
            dataURL: file.dataURL,
          }),
        });

        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as {
          fileId: string;
          mimeType: string;
          deliveryUrl: string;
        };

        uploadedAssetIdsRef.current.add(fileId);

        const cachedFile = latestFilesRef.current[fileId];
        if (cachedFile) {
          cachedFile.mimeType = payload.mimeType as BinaryFileData["mimeType"];
          cachedFile.dataURL = payload.deliveryUrl as BinaryFileData["dataURL"];
        }
      } catch (uploadError) {
        console.error(uploadError);
      } finally {
        uploadingAssetIdsRef.current.delete(fileId);
      }
    }
  });

  const flushSave = useEvent(
    async (reason: "debounced" | "manual" | "hidden") => {
      if (!latestAppStateRef.current) {
        return;
      }

      if (saveInFlightRef.current) {
        queuedSaveRef.current = true;
        return;
      }

      saveInFlightRef.current = true;
      updateState("saving");

      try {
        const sceneData = serializeSceneForDatabase(
          latestElementsRef.current,
          latestAppStateRef.current,
          latestFilesRef.current,
        );

        const response = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            revision: revisionRef.current,
            sceneData,
          }),
          keepalive: reason === "hidden",
        });

        const payload = (await response.json()) as {
          message?: string;
          revision?: number | null;
          lastSavedAt?: string | null;
        };

        if (response.status === 409) {
          if (typeof payload.revision === "number") {
            revisionRef.current = payload.revision;
          }
          setLastSavedAt(payload.lastSavedAt ?? null);
          updateState(
            "conflict",
            "Another session saved newer data. Refresh to re-sync.",
          );
          return;
        }

        if (!response.ok) {
          throw new Error(payload.message ?? "Autosave failed.");
        }

        if (typeof payload.revision === "number") {
          revisionRef.current = payload.revision;
        }

        setLastSavedAt(payload.lastSavedAt ?? null);
        updateState("saved");
      } catch (saveError) {
        updateState(
          "error",
          saveError instanceof Error ? saveError.message : "Autosave failed.",
        );
      } finally {
        saveInFlightRef.current = false;

        if (queuedSaveRef.current) {
          queuedSaveRef.current = false;
          void flushSave("debounced");
        }
      }
    },
  );

  const syncThumbnail = useEvent(
    async (reason: "interval" | "manual" | "hidden") => {
      if (!excalidrawAPI) {
        return;
      }

      const synced = await syncProjectThumbnail({
        projectId: project.id,
        excalidrawAPI,
        keepalive: reason === "hidden",
      });

      if (synced) {
        lastThumbnailAtRef.current = Date.now();
      }
    },
  );

  const scheduleSave = useEvent(() => {
    updateState("dirty");

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void flushSave("debounced");
    }, SAVE_DEBOUNCE_MS);
  });

  const handleSceneChange = useEvent(
    (elements: SceneElements, appState: AppState, files: BinaryFiles) => {
      latestElementsRef.current = elements;
      latestAppStateRef.current = appState;
      latestFilesRef.current = files;
      void uploadPendingAssets(files);

      if (!hasReceivedInitialChangeRef.current) {
        hasReceivedInitialChangeRef.current = true;
        return;
      }

      scheduleSave();
    },
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (
        Date.now() - lastThumbnailAtRef.current <
        THUMBNAIL_SYNC_INTERVAL_MS
      ) {
        return;
      }

      void syncThumbnail("interval");
    }, THUMBNAIL_SYNC_INTERVAL_MS);

    const flushOnHide = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      void flushSave("hidden");
      void syncThumbnail("hidden");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushOnHide();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flushOnHide);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }

      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flushOnHide);
    };
  }, [flushSave, syncThumbnail]);

  return (
    <main className="min-h-screen px-4 py-4 sm:px-6 sm:py-6">
      <div className="soft-card overflow-hidden">
        <header className="canvas-shell flex flex-col gap-4 border-b border-panel-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="rounded-2xl border border-panel-border bg-panel px-4 py-2 text-sm font-semibold text-foreground transition hover:border-white/20 hover:bg-panel-strong"
            >
              Back
            </Link>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">
                Project
              </p>
              <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl">
                {project.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (saveTimerRef.current) {
                  window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }

                void flushSave("manual");
                void syncThumbnail("manual");
              }}
              className="rounded-2xl border border-panel-border bg-panel px-4 py-2 text-sm font-semibold text-foreground transition hover:border-white/20 hover:bg-panel-strong"
            >
              Save now
            </button>
            <SaveIndicator
              state={saveState}
              lastSavedAt={lastSavedAt}
              error={error}
            />
          </div>
        </header>

        <div className="h-[calc(100vh-112px)] bg-slate-950">
          <Excalidraw
            name={project.name}
            theme={THEME.DARK}
            initialData={project.initialData}
            excalidrawAPI={(api: ExcalidrawImperativeAPI) =>
              setExcalidrawAPI(api)
            }
            onChange={handleSceneChange}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                toggleTheme: false,
              },
            }}
          />
        </div>
      </div>
    </main>
  );
}
