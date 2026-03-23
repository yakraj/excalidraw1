import { headers } from "next/headers";
import { NextResponse } from "next/server";

import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toPrismaJson } from "@/lib/prisma-json";
import { getProjectForEditor } from "@/lib/projects";
import { normalizeSceneData } from "@/lib/project-scene";

type SceneBody = {
  revision?: number;
  sceneData?: {
    elements?: ExcalidrawInitialDataState["elements"];
    appState?: ExcalidrawInitialDataState["appState"];
  };
};

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const project = await getProjectForEditor(params.projectId, session.user.id);

  if (!project) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string } },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SceneBody;

  if (!body.sceneData) {
    return NextResponse.json(
      { message: "sceneData is required" },
      { status: 400 },
    );
  }

  const sceneData = normalizeSceneData(body.sceneData);

  const where = {
    id: params.projectId,
    ownerId: session.user.id,
    ...(typeof body.revision === "number" ? { revision: body.revision } : {}),
  };

  const updated = await db.project.updateMany({
    where,
    data: {
      sceneData: toPrismaJson(sceneData),
      lastSavedAt: new Date(),
      revision: {
        increment: 1,
      },
    },
  });

  if (!updated.count) {
    const current = await db.project.findFirst({
      where: {
        id: params.projectId,
        ownerId: session.user.id,
      },
      select: {
        revision: true,
        lastSavedAt: true,
      },
    });

    return NextResponse.json(
      {
        message: "Revision conflict",
        revision: current?.revision ?? null,
        lastSavedAt: current?.lastSavedAt?.toISOString() ?? null,
      },
      { status: 409 },
    );
  }

  const project = await db.project.findFirst({
    where: {
      id: params.projectId,
      ownerId: session.user.id,
    },
    select: {
      revision: true,
      lastSavedAt: true,
    },
  });

  return NextResponse.json({
    revision: project?.revision ?? body.revision ?? 0,
    lastSavedAt:
      project?.lastSavedAt?.toISOString() ?? new Date().toISOString(),
  });
}
