"use client";

import { exportToBlob, THEME } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const blobToDataURL = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const syncProjectThumbnail = async ({
  projectId,
  excalidrawAPI,
  keepalive = false,
}: {
  projectId: string;
  excalidrawAPI: ExcalidrawImperativeAPI;
  keepalive?: boolean;
}) => {
  const elements = excalidrawAPI.getSceneElements();

  if (!elements.length) {
    return false;
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
  const response = await fetch(`/api/projects/${projectId}/thumbnail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dataURL }),
    keepalive,
  });

  return response.ok;
};
