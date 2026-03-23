import type { ReactNode } from "react";

import type { CloudAuthSession } from "./auth";

import { CloudDashboard } from "./CloudDashboard";
import { CloudProjectEditor } from "./CloudProjectEditor";
import { useAppRoute } from "./routes";

export const CloudAppShell = ({
  legacyApp,
  session,
  onSignOut,
}: {
  legacyApp: ReactNode;
  session?: CloudAuthSession | null;
  onSignOut?: () => Promise<void>;
}) => {
  const route = useAppRoute();

  if (route.kind === "auth") {
    return <>{legacyApp}</>;
  }

  if (route.kind === "dashboard" && session && onSignOut) {
    return <CloudDashboard session={session} onSignOut={onSignOut} />;
  }

  if (route.kind === "project") {
    return <CloudProjectEditor projectId={route.projectId} />;
  }

  return <>{legacyApp}</>;
};
