import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  THEME,
  exportToBlob,
  reconcileElements,
} from "@excalidraw/excalidraw";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { useEffect, useRef, useState, startTransition } from "react";

import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  SocketId,
  Collaborator,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import {
  createProject,
  fetchProject,
  updateProjectScene,
  uploadProjectAsset,
  uploadProjectThumbnail,
} from "./api";
import { getStoredCloudAuthToken } from "./auth";
import { SaveBadge } from "./SaveBadge";
import {
  isLocalBinaryFile,
  serializeSceneForDatabase,
  type CloudProjectPayload,
} from "./project-scene";
import { navigateToPath } from "./routes";
import {
  createProjectSocket,
  isCloudRealtimeEnabled,
  type ProjectCollaborator,
  type ServerSocketMessage,
} from "./socket";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../data/localStorage";

import type { SaveState } from "./SaveBadge";

import "./cloud.scss";

type SceneElements = NonNullable<ExcalidrawInitialDataState["elements"]>;

const SAVE_DEBOUNCE_MS = 800;
const SOCKET_SCENE_DEBOUNCE_MS = 120;
const THUMBNAIL_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const createCollaboratorMap = (
  collaborators: ProjectCollaborator[],
  currentClientId: string | null,
) => {
  const map = new Map<SocketId, Collaborator>();

  collaborators.forEach((collaborator) => {
    map.set(collaborator.clientId as SocketId, {
      username: collaborator.username,
      pointer: collaborator.pointer ?? undefined,
      button: collaborator.button,
      selectedElementIds: collaborator.selectedElementIds,
      userState: collaborator.userState as Collaborator["userState"],
      isCurrentUser: collaborator.clientId === currentClientId,
    });
  });

  return map;
};

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

export const CloudProjectEditor = ({ projectId }: { projectId: string }) => {
  const [project, setProject] = useState<CloudProjectPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [collaboratorCount, setCollaboratorCount] = useState(0);
  const [username, setUsername] = useState(
    importUsernameFromLocalStorage() || "",
  );
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null);

  const latestElementsRef = useRef<SceneElements>([]);
  const latestAppStateRef = useRef<AppState | null>(null);
  const latestFilesRef = useRef<BinaryFiles>({});
  const revisionRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const socketSceneTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef(false);
  const hasReceivedInitialChangeRef = useRef(false);
  const applyingRemoteUpdateRef = useRef(false);
  const lastThumbnailAtRef = useRef(Date.now());
  const socketRef = useRef<ReturnType<typeof createProjectSocket> | null>(null);
  const selfClientIdRef = useRef<string | null>(null);
  const uploadingAssetIdsRef = useRef(new Set<string>());
  const uploadedAssetIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (username) {
      return;
    }

    let isCancelled = false;

    import("@excalidraw/random-username").then(({ getRandomUsername }) => {
      if (isCancelled) {
        return;
      }

      const generated = getRandomUsername();
      setUsername(generated);
      saveUsernameToLocalStorage(generated);
    });

    return () => {
      isCancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!username) {
      return;
    }
    saveUsernameToLocalStorage(username);
  }, [username]);

  useEffect(() => {
    let isCancelled = false;

    setLoadError(null);
    setProject(null);
    setSaveState("idle");
    setSaveError(null);
    setLastSavedAt(null);
    hasReceivedInitialChangeRef.current = false;
    uploadedAssetIdsRef.current = new Set();

    fetchProject(projectId)
      .then((data) => {
        if (isCancelled) {
          return;
        }

        setProject(data);
        setLastSavedAt(data.lastSavedAt);
        setSaveState(data.lastSavedAt ? "saved" : "idle");

        latestElementsRef.current = data.initialData.elements;
        latestAppStateRef.current = data.initialData.appState as AppState;
        latestFilesRef.current = data.initialData.files;
        revisionRef.current = data.revision;
        uploadedAssetIdsRef.current = new Set(
          Object.keys(data.initialData.files),
        );
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Failed to load project.",
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [projectId]);

  const updateSaveState = (nextState: SaveState, nextError?: string | null) => {
    startTransition(() => {
      setSaveState(nextState);
      setSaveError(nextError ?? null);
    });
  };

  const uploadPendingAssets = useEvent(async (files: BinaryFiles) => {
    if (!project) {
      return;
    }

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
        const payload = await uploadProjectAsset({
          projectId: project.id,
          fileId,
          mimeType: file.mimeType,
          dataURL: file.dataURL,
        });

        uploadedAssetIdsRef.current.add(fileId);

        latestFilesRef.current[fileId] = payload.file as BinaryFileData;
        excalidrawAPI?.addFiles([payload.file as BinaryFileData]);
      } catch (uploadError) {
        console.error(uploadError);
      } finally {
        uploadingAssetIdsRef.current.delete(fileId);
      }
    }
  });

  const flushSave = useEvent(async () => {
    if (!project || !latestAppStateRef.current) {
      return;
    }

    if (saveInFlightRef.current) {
      queuedSaveRef.current = true;
      return;
    }

    saveInFlightRef.current = true;
    updateSaveState("saving");

    try {
      const payload = await updateProjectScene({
        projectId: project.id,
        revision: revisionRef.current,
        sceneData: serializeSceneForDatabase(
          latestElementsRef.current,
          latestAppStateRef.current,
          latestFilesRef.current,
        ),
      });

      revisionRef.current = payload.revision;
      setLastSavedAt(payload.lastSavedAt);
      updateSaveState("saved");
    } catch (error) {
      updateSaveState(
        "error",
        error instanceof Error ? error.message : "Autosave failed.",
      );
    } finally {
      saveInFlightRef.current = false;

      if (queuedSaveRef.current) {
        queuedSaveRef.current = false;
        void flushSave();
      }
    }
  });

  const syncThumbnail = useEvent(async () => {
    if (!project || !excalidrawAPI) {
      return;
    }

    const elements = excalidrawAPI.getSceneElements();
    if (!elements.length) {
      return;
    }

    const appState = excalidrawAPI.getAppState();
    const blob = await exportToBlob({
      elements,
      files: excalidrawAPI.getFiles(),
      appState: {
        ...appState,
        exportBackground: true,
        exportWithDarkMode: appState.theme === THEME.DARK,
      },
      mimeType: "image/webp",
      quality: 0.86,
      getDimensions: (width: number, height: number) => {
        const longestSide = Math.max(width, height, 1);
        const scale = Math.min(1, 640 / longestSide);

        return {
          width: Math.max(1, Math.round(width * scale)),
          height: Math.max(1, Math.round(height * scale)),
          scale: 1,
        };
      },
    });

    const dataURL = await blobToDataURL(blob);
    await uploadProjectThumbnail({
      projectId: project.id,
      dataURL,
    });
    lastThumbnailAtRef.current = Date.now();
  });

  const queueSocketSceneUpdate = useEvent(() => {
    if (!socketRef.current || !latestAppStateRef.current) {
      return;
    }

    if (socketSceneTimerRef.current) {
      window.clearTimeout(socketSceneTimerRef.current);
    }

    socketSceneTimerRef.current = window.setTimeout(() => {
      if (!latestAppStateRef.current) {
        return;
      }

      socketRef.current?.sendSceneUpdate(
        serializeSceneForDatabase(
          latestElementsRef.current,
          latestAppStateRef.current,
          latestFilesRef.current,
        ),
      );
    }, SOCKET_SCENE_DEBOUNCE_MS);
  });

  const handleSocketMessage = useEvent((message: ServerSocketMessage) => {
    if (message.type === "project-init") {
      selfClientIdRef.current = message.clientId;
      setCollaboratorCount(Math.max(0, message.collaborators.length - 1));

      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          collaborators: createCollaboratorMap(
            message.collaborators,
            selfClientIdRef.current,
          ),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }

      return;
    }

    if (message.type === "collaborators") {
      setCollaboratorCount(
        Math.max(
          0,
          message.collaborators.filter(
            (collaborator) => collaborator.clientId !== selfClientIdRef.current,
          ).length,
        ),
      );

      if (excalidrawAPI) {
        excalidrawAPI.updateScene({
          collaborators: createCollaboratorMap(
            message.collaborators,
            selfClientIdRef.current,
          ),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      return;
    }

    if (message.type === "asset-updated") {
      latestFilesRef.current[message.asset.fileId] = message.asset.file;
      excalidrawAPI?.addFiles([message.asset.file]);
      return;
    }

    if (message.type === "scene-update") {
      if (!excalidrawAPI || message.clientId === selfClientIdRef.current) {
        return;
      }

      applyingRemoteUpdateRef.current = true;

      const currentElements =
        excalidrawAPI.getSceneElementsIncludingDeleted() as OrderedExcalidrawElement[];
      const remoteElements = restoreElements(
        message.sceneData.elements,
        currentElements,
      ) as OrderedExcalidrawElement[];
      const reconciled = reconcileElements(
        currentElements as any,
        remoteElements as any,
        excalidrawAPI.getAppState(),
      ) as SceneElements;
      const nextAppState = restoreAppState(
        message.sceneData.appState,
        excalidrawAPI.getAppState(),
      ) as AppState;

      latestElementsRef.current = reconciled;
      latestAppStateRef.current = nextAppState;

      excalidrawAPI.updateScene({
        elements: reconciled,
        appState: nextAppState,
        captureUpdate: CaptureUpdateAction.NEVER,
      });

      window.setTimeout(() => {
        applyingRemoteUpdateRef.current = false;
      }, 0);

      return;
    }

    if (message.type === "error") {
      setSaveError(message.message);
      setLoadError((current) => current ?? message.message);
    }
  });

  useEffect(() => {
    if (!isCloudRealtimeEnabled()) {
      setCollaboratorCount(0);
      return;
    }

    if (!project || !username) {
      return;
    }

    const token = getStoredCloudAuthToken();
    if (!token) {
      setLoadError("Your cloud session expired. Please sign in again.");
      return;
    }

    const socket = createProjectSocket({
      projectId: project.id,
      token,
      username,
      onMessage: handleSocketMessage,
    });

    socketRef.current = socket;

    return () => {
      socket.close();
      socketRef.current = null;
      selfClientIdRef.current = null;
    };
  }, [handleSocketMessage, project, username]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (
        Date.now() - lastThumbnailAtRef.current >=
        THUMBNAIL_SYNC_INTERVAL_MS
      ) {
        void syncThumbnail();
      }
    }, THUMBNAIL_SYNC_INTERVAL_MS);

    const flushOnHide = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (socketSceneTimerRef.current) {
        window.clearTimeout(socketSceneTimerRef.current);
        socketSceneTimerRef.current = null;
      }

      void flushSave();
      void syncThumbnail();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushOnHide();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushOnHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushOnHide);
    };
  }, [flushSave, syncThumbnail]);

  const scheduleSave = useEvent(() => {
    updateSaveState("dirty");

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  });

  const handleSceneChange = useEvent(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      latestElementsRef.current = elements as SceneElements;
      latestAppStateRef.current = appState;
      latestFilesRef.current = files;
      void uploadPendingAssets(files);

      if (!hasReceivedInitialChangeRef.current) {
        hasReceivedInitialChangeRef.current = true;
        return;
      }

      if (applyingRemoteUpdateRef.current) {
        return;
      }

      scheduleSave();
      queueSocketSceneUpdate();
    },
  );

  const handlePointerUpdate = useEvent(
    ({
      pointer,
      button,
    }: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
      pointersMap: Map<number, Readonly<{ x: number; y: number }>>;
    }) => {
      if (!isCloudRealtimeEnabled()) {
        return;
      }

      const selectedElementIds =
        excalidrawAPI?.getAppState().selectedElementIds || {};

      socketRef.current?.sendPointerUpdate({
        pointer,
        button: button === "down" ? "down" : "up",
        selectedElementIds,
        userState: document.hidden ? "away" : "active",
      });
    },
  );

  const handleCreateProject = async () => {
    const created = await createProject();
    navigateToPath(`/draw/${created.id}`);
  };

  if (loadError) {
    return (
      <main className="cloud-shell cloud-editor-route">
        <div className="cloud-empty-state">
          <h2>Unable to load this project</h2>
          <p>{loadError}</p>
          <div className="cloud-hero-actions">
            <button
              className="cloud-primary-button"
              type="button"
              onClick={() => navigateToPath("/dashboard")}
            >
              Back to Dashboard
            </button>
            <button
              className="cloud-secondary-button"
              type="button"
              onClick={() => navigateToPath("/")}
            >
              Open Legacy Editor
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="cloud-shell cloud-editor-route">
        <div className="cloud-empty-state">
          <h2>Loading project</h2>
          <p>Preparing the scene, assets, and autosave.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="cloud-shell cloud-editor-route">
      <header className="cloud-editor-header">
        <div>
          <button
            type="button"
            className="cloud-link-button"
            onClick={() => navigateToPath("/dashboard")}
          >
            Dashboard
          </button>
          <h1>{project.name}</h1>
          <p>
            Project ID: <span>{project.id}</span>
          </p>
        </div>

        <div className="cloud-editor-actions">
          <span className="cloud-pill">
            {collaboratorCount
              ? `${collaboratorCount} collaborator${
                  collaboratorCount === 1 ? "" : "s"
                } online`
              : "Solo editing"}
          </span>
          <SaveBadge
            state={saveState}
            lastSavedAt={lastSavedAt}
            error={saveError}
          />
          <button
            className="cloud-secondary-button"
            type="button"
            onClick={handleCreateProject}
          >
            New Project
          </button>
          <button
            className="cloud-primary-button"
            type="button"
            onClick={() => {
              if (saveTimerRef.current) {
                window.clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
              }
              void flushSave();
              void syncThumbnail();
            }}
          >
            Save Now
          </button>
        </div>
      </header>

      <div className="cloud-editor-stage">
        <Excalidraw
          key={project.id}
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={project.initialData}
          onChange={handleSceneChange}
          onPointerUpdate={handlePointerUpdate}
          theme={THEME.DARK}
          name={project.name}
          UIOptions={{
            canvasActions: {
              saveToActiveFile: false,
            },
          }}
        >
          <MainMenu>
            <MainMenu.Item onClick={() => navigateToPath("/dashboard")}>
              Dashboard
            </MainMenu.Item>
            <MainMenu.Item onClick={handleCreateProject}>
              New Project
            </MainMenu.Item>
            <MainMenu.DefaultItems.LoadScene />
            <MainMenu.DefaultItems.Export />
            <MainMenu.DefaultItems.SaveAsImage />
            <MainMenu.DefaultItems.Help />
            <MainMenu.DefaultItems.ClearCanvas />
          </MainMenu>
        </Excalidraw>
      </div>
    </main>
  );
};
