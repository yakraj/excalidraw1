import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import type {
  CloudProjectPayload,
  PersistedSceneData,
} from "./project-scene";

const CLOUD_WS_URL =
  import.meta.env.VITE_APP_CLOUD_WS_URL || "ws://localhost:3004/ws";

export type ProjectCollaborator = {
  clientId: string;
  username: string;
  pointer: { x: number; y: number; tool: "pointer" | "laser" } | null;
  button: "down" | "up";
  selectedElementIds: Record<string, true>;
  userState: string;
};

export type ServerSocketMessage =
  | {
      type: "project-init";
      clientId: string;
      project: CloudProjectPayload;
      collaborators: ProjectCollaborator[];
    }
  | {
      type: "scene-update";
      clientId: string;
      sceneData: PersistedSceneData;
    }
  | {
      type: "collaborators";
      collaborators: ProjectCollaborator[];
    }
  | {
      type: "asset-updated";
      asset: {
        fileId: string;
        mimeType: string;
        deliveryUrl: string;
        file: BinaryFileData;
      };
    }
  | { type: "error"; message: string };

export const createProjectSocket = ({
  projectId,
  token,
  username,
  onMessage,
  onOpen,
  onClose,
}: {
  projectId: string;
  token: string;
  username: string;
  onMessage: (message: ServerSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}) => {
  const ws = new WebSocket(CLOUD_WS_URL);

  ws.addEventListener("open", () => {
    ws.send(
      JSON.stringify({
        type: "join-project",
        projectId,
        token,
        username,
      }),
    );
    onOpen?.();
  });

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(String(event.data)) as ServerSocketMessage;
    onMessage(payload);
  });

  ws.addEventListener("close", () => {
    onClose?.();
  });

  return {
    close: () => ws.close(),
    sendSceneUpdate: (sceneData: PersistedSceneData) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "scene-update",
            sceneData,
          }),
        );
      }
    },
    sendPointerUpdate: (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" } | null;
      button: "down" | "up";
      selectedElementIds: Record<string, true>;
      userState: string;
    }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "pointer-update",
            ...payload,
          }),
        );
      }
    },
  };
};
