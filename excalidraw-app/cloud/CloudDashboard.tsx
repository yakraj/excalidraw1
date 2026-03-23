import { useCallback, useEffect, useState } from "react";

import { createProject, deleteProject, listProjects } from "./api";
import { navigateToPath } from "./routes";

import type { CloudAuthSession } from "./auth";
import type { CloudProjectSummary } from "./project-scene";

import "./cloud.scss";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export const CloudDashboard = ({
  session,
  onSignOut,
}: {
  session: CloudAuthSession;
  onSignOut: () => Promise<void>;
}) => {
  const [projects, setProjects] = useState<CloudProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] =
    useState<CloudProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);

    try {
      const items = await listProjects();
      setProjects(items);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load projects.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreateProject = async () => {
    setIsCreating(true);
    setError(null);

    try {
      const project = await createProject();
      navigateToPath(`/draw/${project.id}`);
    } catch (creationError) {
      setError(
        creationError instanceof Error
          ? creationError.message
          : "Failed to create project.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectPendingDelete) {
      return;
    }

    setIsDeletingId(projectPendingDelete.id);
    setError(null);

    try {
      await deleteProject(projectPendingDelete.id);
      setProjects((current) =>
        current.filter((project) => project.id !== projectPendingDelete.id),
      );
      setProjectPendingDelete(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete project.",
      );
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await onSignOut();
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "Failed to sign out.",
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <main className="cloud-shell cloud-dashboard">
      <header className="cloud-workspace-header">
        <div>
          <p className="cloud-kicker">Cloud Workspace</p>
          <h1>Drafts</h1>
          <p className="cloud-subtitle">
            Cloud-saved Excalidraw boards with live thumbnails, autosave, and a
            Figma-style project shelf.
          </p>
        </div>

        <div className="cloud-workspace-actions">
          <span className="cloud-user-pill">
            {session.user.name}
            <small>{session.user.email}</small>
          </span>
          <button
            className="cloud-primary-button"
            type="button"
            onClick={handleCreateProject}
            disabled={isCreating}
          >
            {isCreating ? "Creating..." : "New Project"}
          </button>
          <button
            className="cloud-secondary-button"
            type="button"
            onClick={() => navigateToPath("/legacy")}
          >
            Open Legacy Editor
          </button>
          <button
            className="cloud-secondary-button"
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </header>

      <section className="cloud-workspace-panel">
        <div className="cloud-panel-header">
          <div>
            <p className="cloud-kicker">Recent Files</p>
            <h2>Your Projects</h2>
          </div>
          <span className="cloud-pill">{projects.length} projects</span>
        </div>

        {error && <div className="cloud-error-banner">{error}</div>}

        {isLoading ? (
          <div className="cloud-empty-state">
            <h3>Loading your workspace</h3>
            <p>Fetching previews, save timestamps, and project metadata.</p>
          </div>
        ) : (
          <div className="cloud-project-grid">
            <button
              type="button"
              className="cloud-create-card"
              onClick={handleCreateProject}
              disabled={isCreating}
            >
              <div className="cloud-create-card__preview">
                <div className="cloud-create-card__plus">+</div>
              </div>
              <div className="cloud-create-card__meta">
                <strong>{isCreating ? "Creating..." : "New project"}</strong>
                <span>Start a fresh cloud canvas</span>
              </div>
            </button>

            {projects.map((project) => (
              <article key={project.id} className="cloud-project-card">
                <button
                  type="button"
                  className="cloud-project-open"
                  onClick={() => navigateToPath(`/draw/${project.id}`)}
                >
                  <div className="cloud-project-preview">
                    <div className="cloud-project-preview-stage">
                      {project.thumbnailUrl ? (
                        <img
                          src={project.thumbnailUrl}
                          alt={project.name}
                          loading="lazy"
                        />
                      ) : (
                        <div className="cloud-project-placeholder">
                          <div className="cloud-project-placeholder-sheet" />
                          <span>No preview yet</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="cloud-project-meta">
                    <div>
                      <h3>{project.name}</h3>
                      <p>
                        Updated {dateFormatter.format(new Date(project.updatedAt))}
                      </p>
                    </div>
                    <span className="cloud-project-status">
                      {project.lastSavedAt
                        ? `Saved ${dateFormatter.format(
                            new Date(project.lastSavedAt),
                          )}`
                        : "Not saved yet"}
                    </span>
                  </div>
                </button>

                <div className="cloud-project-card__footer">
                  <button
                    type="button"
                    className="cloud-card-link"
                    onClick={() => navigateToPath(`/draw/${project.id}`)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="cloud-card-danger"
                    onClick={() => setProjectPendingDelete(project)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!isLoading && !projects.length && (
          <div className="cloud-empty-state">
            <h3>No cloud projects yet</h3>
            <p>Create your first canvas and it will appear here with a preview.</p>
          </div>
        )}
      </section>

      {projectPendingDelete && (
        <div
          className="cloud-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isDeletingId) {
              setProjectPendingDelete(null);
            }
          }}
        >
          <div
            className="cloud-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cloud-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="cloud-kicker">Delete Project</p>
            <h3 id="cloud-delete-title">{projectPendingDelete.name}</h3>
            <p className="cloud-modal-copy">
              This will permanently remove the cloud project, its saved scene,
              uploaded assets, and dashboard preview.
            </p>
            <div className="cloud-modal-actions">
              <button
                type="button"
                className="cloud-secondary-button"
                onClick={() => setProjectPendingDelete(null)}
                disabled={!!isDeletingId}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cloud-danger-button"
                onClick={() => {
                  void handleDeleteProject();
                }}
                disabled={!!isDeletingId}
              >
                {isDeletingId === projectPendingDelete.id
                  ? "Deleting..."
                  : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
