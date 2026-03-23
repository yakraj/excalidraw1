import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  DataURL,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

type PersistedElements = NonNullable<ExcalidrawInitialDataState["elements"]>;
type PersistedAppState = NonNullable<ExcalidrawInitialDataState["appState"]>;

export type PersistedSceneData = {
  elements: PersistedElements;
  appState: PersistedAppState;
};

export type CloudProjectSummary = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  lastSavedAt: string | null;
  updatedAt: string;
  revision: number;
};

export type CloudProjectPayload = {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  lastSavedAt: string | null;
  revision: number;
  initialData: {
    elements: PersistedElements;
    appState: PersistedAppState;
    files: BinaryFiles;
  };
};

export type ProjectAssetRecord = {
  fileId: string;
  mimeType: string;
  deliveryUrl: string;
  createdAt: Date;
};

export const EMPTY_SCENE_DATA: PersistedSceneData = {
  elements: [],
  appState: {},
};

const isDeprecatedBlankCloudScene = (candidate: Partial<PersistedSceneData>) => {
  const appState =
    candidate.appState && typeof candidate.appState === "object"
      ? candidate.appState
      : null;

  if (!appState || !Array.isArray(candidate.elements) || candidate.elements.length) {
    return false;
  }

  const keys = Object.keys(appState);
  return (
    appState.viewBackgroundColor === "#0f172a" &&
    appState.gridModeEnabled === false &&
    keys.every((key) => key === "viewBackgroundColor" || key === "gridModeEnabled")
  );
};

export const normalizeSceneData = (sceneData: unknown): PersistedSceneData => {
  if (!sceneData || typeof sceneData !== "object") {
    return EMPTY_SCENE_DATA;
  }

  const candidate = sceneData as Partial<PersistedSceneData>;

  if (isDeprecatedBlankCloudScene(candidate)) {
    return EMPTY_SCENE_DATA;
  }

  return {
    elements: Array.isArray(candidate.elements)
      ? (candidate.elements as PersistedElements)
      : EMPTY_SCENE_DATA.elements,
    appState:
      candidate.appState && typeof candidate.appState === "object"
        ? (candidate.appState as PersistedAppState)
        : EMPTY_SCENE_DATA.appState,
  };
};

export const serializeSceneForDatabase = (
  elements: PersistedElements,
  appState: AppState,
  files: BinaryFiles,
): PersistedSceneData => {
  const payload = JSON.parse(
    serializeAsJSON(elements, appState, files, "database"),
  ) as {
    elements?: PersistedElements;
    appState?: PersistedAppState;
  };

  return {
    elements: payload.elements ?? [],
    appState: payload.appState ?? {},
  };
};

export const hydrateBinaryFiles = (
  assets: readonly ProjectAssetRecord[],
): BinaryFiles => {
  return assets.reduce<BinaryFiles>((files, asset) => {
    files[asset.fileId] = {
      id: asset.fileId as BinaryFileData["id"],
      mimeType: asset.mimeType as BinaryFileData["mimeType"],
      dataURL: asset.deliveryUrl as DataURL,
      created: asset.createdAt.getTime(),
      lastRetrieved: Date.now(),
    };

    return files;
  }, {});
};

export const isLocalBinaryFile = (file: BinaryFileData) => {
  return (
    typeof file.dataURL === "string" &&
    (file.dataURL.startsWith("data:") || file.dataURL.startsWith("blob:"))
  );
};
