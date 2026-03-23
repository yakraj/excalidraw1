import { notFound } from "next/navigation";

import { CloudEditor } from "@/components/editor/CloudEditor";
import { getProjectForEditor } from "@/lib/projects";
import { requireSession } from "@/lib/session";

export default async function DrawProjectPage({
  params,
}: {
  params: { projectId: string };
}) {
  const session = await requireSession();
  const project = await getProjectForEditor(params.projectId, session.user.id);

  if (!project) {
    notFound();
  }

  return <CloudEditor project={project} />;
}
