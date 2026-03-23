import clsx from "clsx";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const SaveBadge = ({
  state,
  lastSavedAt,
  error,
}: {
  state: SaveState;
  lastSavedAt: string | null;
  error: string | null;
}) => {
  const label =
    state === "saving"
      ? "Saving..."
      : state === "saved"
        ? lastSavedAt
          ? `Saved ${new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(lastSavedAt))}`
          : "Saved"
        : state === "error"
          ? error || "Save failed"
          : state === "dirty"
            ? "Unsaved changes"
            : "Cloud ready";

  return (
    <div
      className={clsx("cloud-save-badge", {
        "is-saving": state === "saving",
        "is-saved": state === "saved",
        "is-error": state === "error",
      })}
    >
      {label}
    </div>
  );
};
