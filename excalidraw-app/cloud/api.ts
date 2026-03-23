import type {
  CloudProjectPayload,
  CloudProjectSummary,
  PersistedSceneData,
} from "./project-scene";
import { cloudRequest } from "./auth";

export const listProjects = async () => {
  const payload = await cloudRequest<{ projects: CloudProjectSummary[] }>(
    "/projects",
  );
  return payload.projects;
};

export const createProject = async () => {
  return cloudRequest<{ id: string }>("/projects", {
    method: "POST",
    body: JSON.stringify({}),
  });
};

export const fetchProject = async (projectId: string) => {
  return cloudRequest<CloudProjectPayload>(`/projects/${projectId}`, {
    method: "GET",
  });
};

export const updateProjectScene = async ({
  projectId,
  revision,
  sceneData,
}: {
  projectId: string;
  revision: number;
  sceneData: PersistedSceneData;
}) => {
  return cloudRequest<{
    name: string;
    revision: number;
    lastSavedAt: string | null;
    updatedAt: string;
  }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({
      revision,
      sceneData,
    }),
  });
};

export const renameProject = async ({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) => {
  return cloudRequest<{
    name: string;
    revision: number;
    lastSavedAt: string | null;
    updatedAt: string;
  }>(`/projects/${projectId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
};

export const deleteProject = async (projectId: string) => {
  return cloudRequest<{ id: string }>(`/projects/${projectId}`, {
    method: "DELETE",
  });
};

export const uploadProjectAsset = async ({
  projectId,
  fileId,
  mimeType,
  dataURL,
}: {
  projectId: string;
  fileId: string;
  mimeType: string;
  dataURL: string;
}) => {
  return cloudRequest<{
    fileId: string;
    mimeType: string;
    deliveryUrl: string;
    file: {
      id: string;
      mimeType: string;
      dataURL: string;
      created: number;
      lastRetrieved: number;
    };
  }>(`/projects/${projectId}/assets`, {
    method: "POST",
    body: JSON.stringify({
      fileId,
      mimeType,
      dataURL,
    }),
  });
};

export const uploadProjectThumbnail = async ({
  projectId,
  dataURL,
}: {
  projectId: string;
  dataURL: string;
}) => {
  return cloudRequest<{ thumbnailUrl: string }>(
    `/projects/${projectId}/thumbnail`,
    {
      method: "POST",
      body: JSON.stringify({ dataURL }),
    },
  );
};
