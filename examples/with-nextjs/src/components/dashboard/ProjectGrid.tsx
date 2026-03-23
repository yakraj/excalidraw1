import Link from "next/link";

type ProjectGridProps = {
  projects: Array<{
    id: string;
    name: string;
    thumbnailUrl: string | null;
    lastSavedAt: Date | null;
    updatedAt: Date;
    revision: number;
  }>;
};

const formatDate = (value: Date | null) => {
  if (!value) {
    return "Not saved yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
};

export function ProjectGrid({ projects }: ProjectGridProps) {
  if (!projects.length) {
    return (
      <div className="grid place-items-center rounded-[24px] border border-dashed border-panel-border bg-panel-strong/70 px-6 py-14 text-center">
        <div className="max-w-md">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">
            No sketches yet
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Start a new project and the editor will create the Postgres row up
            front, then keep your scene and thumbnail synced automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/draw/${project.id}`}
          className="group overflow-hidden rounded-[24px] border border-panel-border bg-panel-strong/70 transition hover:-translate-y-1 hover:border-white/20 hover:shadow-[0_20px_60px_rgba(2,8,23,0.45)]"
        >
          <div className="relative aspect-[16/10] overflow-hidden border-b border-panel-border bg-slate-950">
            {project.thumbnailUrl ? (
              <img
                src={project.thumbnailUrl}
                alt={project.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.14),_transparent_35%),linear-gradient(180deg,_rgba(15,23,42,0.96),_rgba(2,6,23,1))]">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted">
                  No preview yet
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-xl">
                  {project.name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Revision {project.revision}
                </p>
              </div>
              <span className="rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                Cloud
              </span>
            </div>

            <div className="flex items-center justify-between text-sm text-muted">
              <span>Last saved</span>
              <span>
                {formatDate(project.lastSavedAt ?? project.updatedAt)}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
