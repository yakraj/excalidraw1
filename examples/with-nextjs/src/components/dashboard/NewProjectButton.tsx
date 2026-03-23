"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function NewProjectButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const response = await fetch("/api/projects", {
            method: "POST",
          });

          const payload = (await response.json()) as {
            message?: string;
            projectId?: string;
          };

          if (!response.ok || !payload.projectId) {
            throw new Error(payload.message ?? "Unable to create project.");
          }

          router.push(`/draw/${payload.projectId}`);
          router.refresh();
        });
      }}
      className="rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isPending ? "Creating..." : "New Project"}
    </button>
  );
}
