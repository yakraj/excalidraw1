import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/AuthCard";
import { getSession } from "@/lib/session";

export default async function SignUpPage() {
  const session = await getSession();

  if (session) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-10 sm:px-10">
      <AuthCard mode="signup" />
    </main>
  );
}
