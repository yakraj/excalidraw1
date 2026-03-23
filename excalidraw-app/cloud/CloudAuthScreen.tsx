import { useState } from "react";

import type { FormEvent } from "react";

import { navigateToPath } from "./routes";

type CloudAuthScreenProps = {
  status: "loading" | "authenticated" | "anonymous";
  error: string | null;
  onSignIn: (credentials: {
    email: string;
    password: string;
  }) => Promise<unknown>;
  onSignUp: (credentials: {
    name: string;
    email: string;
    password: string;
  }) => Promise<unknown>;
};

export const CloudAuthScreen = ({
  status,
  error,
  onSignIn,
  onSignUp,
}: CloudAuthScreenProps) => {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formError = submitError || error;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mode === "sign-up") {
        await onSignUp({ name, email, password });
      } else {
        await onSignIn({ email, password });
      }

      navigateToPath("/dashboard", { replace: true });
    } catch (submitAuthError) {
      setSubmitError(
        submitAuthError instanceof Error
          ? submitAuthError.message
          : "We couldn't complete your request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="cloud-shell cloud-auth-shell">
      <section className="cloud-auth-layout">
        <div className="cloud-auth-hero">
          <p className="cloud-kicker">Cloud Workspace</p>
          <h1>Same Excalidraw editor, now with cloud projects.</h1>
          <p className="cloud-subtitle">
            Sign in to open your dashboard, keep every board autosaved to
            Postgres, and jump back into the legacy editor whenever you want.
          </p>

          <div className="cloud-auth-highlights">
            <div className="cloud-auth-highlight">
              <strong>Autosave + Ctrl+S</strong>
              <span>Save the same canvas UI directly to the cloud.</span>
            </div>
            <div className="cloud-auth-highlight">
              <strong>Live project shelf</strong>
              <span>See thumbnails, rename files, and manage drafts fast.</span>
            </div>
            <div className="cloud-auth-highlight">
              <strong>Legacy editor preserved</strong>
              <span>Open the local-only editor anytime at `/legacy`.</span>
            </div>
          </div>

          <div className="cloud-auth-actions">
            <button
              type="button"
              className="cloud-secondary-button"
              onClick={() => navigateToPath("/legacy")}
            >
              Open Legacy Editor
            </button>
          </div>
        </div>

        <div className="cloud-auth-panel">
          <div className="cloud-auth-toggle" role="tablist" aria-label="Auth mode">
            <button
              type="button"
              className={mode === "sign-in" ? "is-active" : ""}
              onClick={() => {
                setMode("sign-in");
                setSubmitError(null);
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "sign-up" ? "is-active" : ""}
              onClick={() => {
                setMode("sign-up");
                setSubmitError(null);
              }}
            >
              Sign up
            </button>
          </div>

          <div className="cloud-auth-panel__copy">
            <h2>
              {status === "loading"
                ? "Checking your session"
                : mode === "sign-up"
                  ? "Create your workspace"
                  : "Welcome back"}
            </h2>
            <p>
              {status === "loading"
                ? "If you're already signed in, we'll open your dashboard in a moment."
                : mode === "sign-up"
                  ? "Create an account to start saving Excalidraw projects to the cloud."
                  : "Sign in to open your saved boards and keep working."}
            </p>
          </div>

          <form className="cloud-auth-form" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <label className="cloud-field">
                <span>Name</span>
                <input
                  className="cloud-input"
                  type="text"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  disabled={isSubmitting || status === "loading"}
                  required
                />
              </label>
            )}

            <label className="cloud-field">
              <span>Email</span>
              <input
                className="cloud-input"
                type="email"
                name="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isSubmitting || status === "loading"}
                required
              />
            </label>

            <label className="cloud-field">
              <span>Password</span>
              <input
                className="cloud-input"
                type="password"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                disabled={isSubmitting || status === "loading"}
                minLength={6}
                required
              />
            </label>

            {formError && <div className="cloud-error-banner">{formError}</div>}

            <button
              type="submit"
              className="cloud-primary-button"
              disabled={isSubmitting || status === "loading"}
            >
              {status === "loading"
                ? "Checking..."
                : isSubmitting
                  ? mode === "sign-up"
                    ? "Creating account..."
                    : "Signing in..."
                  : mode === "sign-up"
                    ? "Create account"
                    : "Login"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
};
