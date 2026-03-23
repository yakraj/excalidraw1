"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";

type AuthCardProps = {
  mode: "signin" | "signup";
};

export function AuthCard({ mode }: AuthCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const isSignUp = mode === "signup";

  return (
    <div className="soft-card w-full max-w-md overflow-hidden">
      <div className="border-b border-panel-border px-8 py-8">
        <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.24em] text-muted">
          Sketch Cloud
        </span>
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl">
          {isSignUp ? "Create your workspace" : "Welcome back"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {isSignUp
            ? "Spin up an autosaving Excalidraw workspace backed by Postgres and Cloudinary."
            : "Sign in to continue working across your cloud-synced projects."}
        </p>
      </div>

      <form
        className="space-y-5 px-8 py-8"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);

          const formData = new FormData(event.currentTarget);
          const name = String(formData.get("name") ?? "").trim();
          const email = String(formData.get("email") ?? "")
            .trim()
            .toLowerCase();
          const password = String(formData.get("password") ?? "");

          startTransition(async () => {
            const result = isSignUp
              ? await authClient.signUp.email({
                  name,
                  email,
                  password,
                  callbackURL: "/",
                })
              : await authClient.signIn.email({
                  email,
                  password,
                  callbackURL: "/",
                });

            if (result.error) {
              setError(result.error.message ?? "Unable to continue.");
              return;
            }

            router.replace("/");
            router.refresh();
          });
        }}
      >
        {isSignUp ? (
          <label className="block space-y-2 text-sm">
            <span className="text-muted">Name</span>
            <input
              required
              name="name"
              disabled={isPending}
              className="w-full rounded-2xl border border-panel-border bg-panel-strong px-4 py-3 outline-none transition focus:border-accent"
              placeholder="Ada Lovelace"
            />
          </label>
        ) : null}

        <label className="block space-y-2 text-sm">
          <span className="text-muted">Email</span>
          <input
            required
            type="email"
            name="email"
            disabled={isPending}
            className="w-full rounded-2xl border border-panel-border bg-panel-strong px-4 py-3 outline-none transition focus:border-accent"
            placeholder="team@company.com"
          />
        </label>

        <label className="block space-y-2 text-sm">
          <span className="text-muted">Password</span>
          <input
            required
            minLength={8}
            type="password"
            name="password"
            disabled={isPending}
            className="w-full rounded-2xl border border-panel-border bg-panel-strong px-4 py-3 outline-none transition focus:border-accent"
            placeholder="Minimum 8 characters"
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending
            ? isSignUp
              ? "Creating account..."
              : "Signing in..."
            : isSignUp
            ? "Create account"
            : "Sign in"}
        </button>

        <p className="text-sm text-muted">
          {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
          <Link
            href={isSignUp ? "/sign-in" : "/sign-up"}
            className="font-semibold text-accent"
          >
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </form>
    </div>
  );
}
