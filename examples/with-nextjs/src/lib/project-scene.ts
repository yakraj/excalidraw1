import type {
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

export type ProjectAssetRecord = {
  fileId: string;
  mimeType: string;
  deliveryUrl: string;
  createdAt: Date;
};

export type EditorProjectPayload = {
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

export const EMPTY_SCENE_DATA: PersistedSceneData = {
  elements: [],
  appState: {
    viewBackgroundColor: "#0f172a",
    gridModeEnabled: false,
  },
};

export const createProjectName = () => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return `Untitled ${formatter.format(new Date())}`;
};

export const normalizeSceneData = (sceneData: unknown): PersistedSceneData => {
  if (!sceneData || typeof sceneData !== "object") {
    return EMPTY_SCENE_DATA;
  }

  const candidate = sceneData as Partial<PersistedSceneData>;

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

export const extractReferencedFileIds = (elements: PersistedElements) => {
  const fileIds = new Set<string>();

  for (const element of elements) {
    if ("fileId" in element && typeof element.fileId === "string") {
      fileIds.add(element.fileId);
    }
  }

  return fileIds;
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
