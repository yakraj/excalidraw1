"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await authClient.signOut();
          router.replace("/sign-in");
          router.refresh();
        });
      }}
      className="rounded-2xl border border-panel-border bg-panel px-4 py-3 text-sm font-semibold text-foreground transition hover:border-white/20 hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
