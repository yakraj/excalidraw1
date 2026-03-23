type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

type SaveIndicatorProps = {
  state: SaveState;
  lastSavedAt: string | null;
  error: string | null;
};

const formatSavedAt = (value: string | null) => {
  if (!value) {
    return "Waiting for first save";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
};

export function SaveIndicator({
  state,
  lastSavedAt,
  error,
}: SaveIndicatorProps) {
  const toneMap: Record<SaveState, { label: string; className: string }> = {
    idle: {
      label: "Ready",
      className: "border-white/10 bg-white/5 text-muted",
    },
    dirty: {
      label: "Unsaved changes",
      className: "border-warning/25 bg-warning/10 text-warning",
    },
    saving: {
      label: "Saving...",
      className: "border-accent/25 bg-accent-soft text-accent",
    },
    saved: {
      label: "Saved",
      className: "border-success/25 bg-success/10 text-success",
    },
    error: {
      label: "Save failed",
      className: "border-danger/25 bg-danger/10 text-danger",
    },
    conflict: {
      label: "Conflict detected",
      className: "border-danger/25 bg-danger/10 text-danger",
    },
  };

  const tone = toneMap[state];

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${tone.className}`}
      >
        {tone.label}
      </span>
      <span className="text-xs text-muted">
        {error ?? `Last sync ${formatSavedAt(lastSavedAt)}`}
      </span>
    </div>
  );
}
