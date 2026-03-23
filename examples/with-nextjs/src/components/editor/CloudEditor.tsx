"use client";

import dynamic from "next/dynamic";

import type { EditorProjectPayload } from "@/lib/project-scene";

const ProjectCanvas = dynamic(
  async () => (await import("./ProjectCanvas")).ProjectCanvas,
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-screen place-items-center px-6">
        <div className="soft-card w-full max-w-lg p-8 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            Preparing editor
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Loading your latest scene, cloud assets, and autosave pipeline.
          </p>
        </div>
      </div>
    ),
  },
);

export function CloudEditor({ project }: { project: EditorProjectPayload }) {
  return <ProjectCanvas project={project} />;
}
