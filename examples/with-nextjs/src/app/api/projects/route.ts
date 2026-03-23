import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { createProjectForUser } from "@/lib/projects";

export async function POST() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const project = await createProjectForUser(session.user.id);

  return NextResponse.json({ projectId: project.id }, { status: 201 });
}
