import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { db } from "@/lib/db";

type AssetBody = {
  fileId?: string;
  mimeType?: string;
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

  const body = (await request.json()) as AssetBody;

  if (!body.fileId || !body.mimeType || !body.dataURL) {
    return NextResponse.json(
      { message: "fileId, mimeType, and dataURL are required" },
      { status: 400 },
    );
  }

  const shouldRasterizeSvg = body.mimeType === "image/svg+xml";
  const result = await cloudinary.uploader.upload(body.dataURL, {
    folder: "sketch-cloud/assets",
    public_id: `${params.projectId}/${body.fileId}`,
    overwrite: true,
    resource_type: "image",
    format: shouldRasterizeSvg ? "png" : undefined,
  });

  const storedMimeType = shouldRasterizeSvg ? "image/png" : body.mimeType;

  const asset = await db.projectAsset.upsert({
    where: {
      projectId_fileId: {
        projectId: params.projectId,
        fileId: body.fileId,
      },
    },
    update: {
      mimeType: storedMimeType,
      secureUrl: result.secure_url,
      deliveryUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      width: result.width ?? null,
      height: result.height ?? null,
      bytes: result.bytes ?? null,
    },
    create: {
      projectId: params.projectId,
      fileId: body.fileId,
      mimeType: storedMimeType,
      secureUrl: result.secure_url,
      deliveryUrl: result.secure_url,
      cloudinaryPublicId: result.public_id,
      width: result.width ?? null,
      height: result.height ?? null,
      bytes: result.bytes ?? null,
    },
    select: {
      fileId: true,
      mimeType: true,
      deliveryUrl: true,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}
