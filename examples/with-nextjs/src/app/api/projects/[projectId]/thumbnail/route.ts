import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/db";

type ThumbnailBody = {
  dataURL?: string;
};

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } },
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const project = await db.project.findFirst({
    where: {
      id: params.projectId,
      ownerId: session.user.id,
    },
    select: {
      id: true,
    },
  });

  if (!project) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as ThumbnailBody;

  if (!body.dataURL) {
    return NextResponse.json(
      { message: "dataURL is required" },
      { status: 400 },
    );
  }

  const result = await cloudinary.uploader.upload(body.dataURL, {
    folder: "sketch-cloud/thumbnails",
    public_id: `${params.projectId}/thumbnail`,
    overwrite: true,
    resource_type: "image",
    format: "webp",
  });

  await db.project.update({
    where: {
      id: params.projectId,
    },
    data: {
      thumbnailUrl: result.secure_url,
    },
  });

  return NextResponse.json(
    { thumbnailUrl: result.secure_url },
    { status: 201 },
  );
}
