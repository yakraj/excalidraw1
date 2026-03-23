import {
  CaptureUpdateAction,
  THEME,
  exportToBlob,
  reconcileElements,
} from "@excalidraw/excalidraw";
import { restoreAppState, restoreElements } from "@excalidraw/excalidraw/data/restore";
import { useEffect, useRef, useState, startTransition } from "react";

import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  SocketId,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import {
  fetchProject,
  renameProject,
  updateProjectScene,
  uploadProjectAsset,
  uploadProjectThumbnail,
} from "./api";
import { getStoredCloudAuthToken } from "./auth";
import { isLocalBinaryFile, serializeSceneForDatabase } from "./project-scene";
import {
  createProjectSocket,
  type ProjectCollaborator,
  type ServerSocketMessage,
} from "./socket";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../data/localStorage";

import type { CloudProjectPayload } from "./project-scene";
import type { SaveState } from "./SaveBadge";

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
    if (collaborator.clientId === currentClientId) {
      return;
    }

    map.set(collaborator.clientId as SocketId, {
      username: collaborator.username,
      pointer: collaborator.pointer ?? undefined,
      button: collaborator.button,
      selectedElementIds: collaborator.selectedElementIds,
      userState: collaborator.userState as Collaborator["userState"],
      isCurrentUser: false,
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

export const useCloudProjectSync = ({
  projectId,
  excalidrawAPI,
}: {
  projectId: string | null;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const [project, setProject] = useState<CloudProjectPayload | null>(null);
  const [projectName, setProjectName] = useState("");
  const [initialData, setInitialData] =
    useState<ExcalidrawInitialDataState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [collaboratorCount, setCollaboratorCount] = useState(0);
  const [username, setUsername] = useState(importUsernameFromLocalStorage() || "");

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
  const savedProjectNameRef = useRef("");

  useEffect(() => {
    if (username || !projectId) {
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
  }, [projectId, username]);

  useEffect(() => {
    if (!username) {
      return;
    }
    saveUsernameToLocalStorage(username);
  }, [username]);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setProjectName("");
      setInitialData(null);
      setLoadError(null);
      setSaveState("idle");
      setSaveError(null);
      setLastSavedAt(null);
      setCollaboratorCount(0);
      latestElementsRef.current = [];
      latestAppStateRef.current = null;
      latestFilesRef.current = {};
      revisionRef.current = 0;
      uploadedAssetIdsRef.current = new Set();
      uploadingAssetIdsRef.current.clear();
      hasReceivedInitialChangeRef.current = false;
      applyingRemoteUpdateRef.current = false;
      return;
    }

    let isCancelled = false;

    setLoadError(null);
    setProject(null);
    setInitialData(null);
    setSaveState("idle");
    setSaveError(null);
    setLastSavedAt(null);
    setCollaboratorCount(0);
    hasReceivedInitialChangeRef.current = false;
    applyingRemoteUpdateRef.current = false;
    lastThumbnailAtRef.current = Date.now();
    uploadedAssetIdsRef.current = new Set();
    uploadingAssetIdsRef.current.clear();

    fetchProject(projectId)
      .then((data) => {
        if (isCancelled) {
          return;
        }

        setProject(data);
        setProjectName(data.name);
        setInitialData(data.initialData);
        setLastSavedAt(data.lastSavedAt);
        setSaveState(data.lastSavedAt ? "saved" : "idle");

        latestElementsRef.current = data.initialData.elements;
        latestAppStateRef.current = data.initialData.appState as AppState;
        latestFilesRef.current = data.initialData.files;
        revisionRef.current = data.revision;
        uploadedAssetIdsRef.current = new Set(Object.keys(data.initialData.files));
        savedProjectNameRef.current = data.name;
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

  const handleProjectNameChange = useEvent((nextName: string) => {
    setProjectName(nextName);

    const normalized = nextName.trim().replace(/\s+/g, " ");
    if (
      normalized &&
      normalized !== savedProjectNameRef.current &&
      saveState !== "saving"
    ) {
      updateSaveState("dirty");
    }
  });

  const commitProjectName = useEvent(async () => {
    if (!project) {
      return projectName;
    }

    const normalized =
      projectName.trim().replace(/\s+/g, " ").slice(0, 120) || "Untitled project";

    if (
      normalized === savedProjectNameRef.current &&
      normalized === projectName
    ) {
      return normalized;
    }

    setProjectName(normalized);
    updateSaveState("saving");

    try {
      const payload = await renameProject({
        projectId: project.id,
        name: normalized,
      });

      savedProjectNameRef.current = payload.name;
      setProjectName(payload.name);
      setProject((current) =>
        current
          ? {
              ...current,
              name: payload.name,
              revision: payload.revision,
              lastSavedAt: payload.lastSavedAt,
            }
          : current,
      );

      updateSaveState("saved");
      return payload.name;
    } catch (error) {
      updateSaveState(
        "error",
        error instanceof Error ? error.message : "Unable to rename project.",
      );
      throw error;
    }
  });

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
      setProject((current) =>
        current
          ? {
              ...current,
              name: payload.name,
              lastSavedAt: payload.lastSavedAt,
              revision: payload.revision,
            }
          : current,
      );
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
    const payload = await uploadProjectThumbnail({
      projectId: project.id,
      dataURL,
    });

    setProject((current) =>
      current ? { ...current, thumbnailUrl: payload.thumbnailUrl } : current,
    );
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
      setCollaboratorCount(0);
    };
  }, [handleSocketMessage, project, username]);

  useEffect(() => {
    if (!projectId) {
      return;
    }

    const flushPendingWork = () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (socketSceneTimerRef.current) {
        window.clearTimeout(socketSceneTimerRef.current);
        socketSceneTimerRef.current = null;
      }

      void commitProjectName();
      void flushSave();
      void syncThumbnail();
    };

    const intervalId = window.setInterval(() => {
      if (
        Date.now() - lastThumbnailAtRef.current >=
        THUMBNAIL_SYNC_INTERVAL_MS
      ) {
        void syncThumbnail();
      }
    }, THUMBNAIL_SYNC_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushPendingWork();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushPendingWork);

    return () => {
      flushPendingWork();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushPendingWork);
    };
  }, [flushSave, projectId, syncThumbnail]);

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

  const saveNow = useEvent(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    await commitProjectName();
    await flushSave();
    await syncThumbnail();
  });

  return {
    project,
    projectName,
    initialData,
    loadError,
    saveState,
    saveError,
    lastSavedAt,
    collaboratorCount,
    handleProjectNameChange,
    commitProjectName,
    handleSceneChange,
    handlePointerUpdate,
    saveNow,
  };
};
