import Link from "next/link";

import { ProjectGrid } from "@/components/dashboard/ProjectGrid";
import { NewProjectButton } from "@/components/dashboard/NewProjectButton";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { getDashboardProjects } from "@/lib/projects";
import { getSession } from "@/lib/session";

export default async function Page() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-10">
        <section className="soft-card grid-pattern relative overflow-hidden p-8 sm:p-12">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          <div className="max-w-3xl space-y-6">
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted">
              Local-first Excalidraw Cloud
            </span>
            <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight sm:text-6xl">
              Autosaving sketch workspaces without the `.excalidraw` file hop.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Ship a Figma-like drawing flow with Postgres JSONB scene storage,
              Cloudinary-backed assets, and an Excalidraw editor that saves in
              the background.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="rounded-2xl bg-accent px-5 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110"
              >
                Start building
              </Link>
              <Link
                href="/sign-in"
                className="rounded-2xl border border-panel-border bg-panel px-5 py-3 text-sm font-semibold text-foreground transition hover:border-white/20 hover:bg-panel-strong"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          {[
            {
              title: "JSONB Scene Sync",
              description:
                "Persist only elements and app state on a tight debounce for low-latency autosaves.",
            },
            {
              title: "Cloudinary Asset Flow",
              description:
                "Upload images once, keep scene payloads lean, and hydrate binary files on project load.",
            },
            {
              title: "Production-Friendly Foundation",
              description:
                "App Router, Prisma, Better Auth, and clean server routes ready for multi-user collaboration.",
            },
          ].map((item) => (
            <article key={item.title} className="soft-card p-6">
              <h2 className="font-[family-name:var(--font-display)] text-xl">
                {item.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                {item.description}
              </p>
            </article>
          ))}
        </section>
      </main>
    );
  }

  const projects = await getDashboardProjects(session.user.id);

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-8 sm:px-10">
      <section className="soft-card overflow-hidden">
        <div className="flex flex-col gap-6 border-b border-panel-border px-6 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div className="space-y-3">
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted">
              Workspace
            </span>
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-3xl sm:text-4xl">
                Welcome back, {session.user.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Your projects are cloud-backed, image assets are externalized,
                and every stroke syncs quietly into Postgres.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <NewProjectButton />
            <SignOutButton />
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <ProjectGrid projects={projects} />
        </div>
      </section>
    </main>
  );
}
