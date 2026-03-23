import { db } from "@/lib/db";
import { toPrismaJson } from "@/lib/prisma-json";
import {
  createProjectName,
  hydrateBinaryFiles,
  normalizeSceneData,
  type EditorProjectPayload,
} from "@/lib/project-scene";

export const createProjectForUser = async (ownerId: string) => {
  return db.project.create({
    data: {
      ownerId,
      name: createProjectName(),
      sceneData: toPrismaJson({
        elements: [],
        appState: {
          viewBackgroundColor: "#0f172a",
          gridModeEnabled: false,
        },
      }),
    },
    select: {
      id: true,
    },
  });
};

export const getDashboardProjects = async (ownerId: string) => {
  return db.project.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      thumbnailUrl: true,
      lastSavedAt: true,
      updatedAt: true,
      revision: true,
    },
  });
};

export const getProjectForEditor = async (
  projectId: string,
  ownerId: string,
): Promise<EditorProjectPayload | null> => {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId,
    },
    include: {
      assets: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  const sceneData = normalizeSceneData(project.sceneData);

  return {
    id: project.id,
    name: project.name,
    thumbnailUrl: project.thumbnailUrl,
    lastSavedAt: project.lastSavedAt?.toISOString() ?? null,
    revision: project.revision,
    initialData: {
      elements: sceneData.elements,
      appState: sceneData.appState,
      files: hydrateBinaryFiles(project.assets),
    },
  };
};
