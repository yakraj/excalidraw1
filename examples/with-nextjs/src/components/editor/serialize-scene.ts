"use client";

import { serializeAsJSON } from "@excalidraw/excalidraw";

import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

type PersistedElements = NonNullable<ExcalidrawInitialDataState["elements"]>;
type PersistedAppState = NonNullable<ExcalidrawInitialDataState["appState"]>;

export type PersistedSceneData = {
  elements: PersistedElements;
  appState: PersistedAppState;
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
