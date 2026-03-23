import { useEffect, useState } from "react";

const NAVIGATION_EVENT = "excalidraw-cloud:navigate";

export type AppRoute =
  | { kind: "auth" }
  | { kind: "legacy" }
  | { kind: "dashboard" }
  | { kind: "project"; projectId: string };

const shouldUseLegacyRoot = ({
  pathname,
  search,
  hash,
}: {
  pathname: string;
  search: string;
  hash: string;
}) => {
  if (pathname !== "/") {
    return false;
  }

  const searchParams = new URLSearchParams(search);

  return (
    searchParams.has("id") ||
    /^#json=/.test(hash) ||
    /^#url=/.test(hash) ||
    /^#room=/.test(hash)
  );
};

export const parseAppRoute = (
  pathname = window.location.pathname,
  search = window.location.search,
  hash = window.location.hash,
): AppRoute => {
  if (pathname === "/") {
    return shouldUseLegacyRoot({ pathname, search, hash })
      ? { kind: "legacy" }
      : { kind: "auth" };
  }

  if (pathname === "/legacy") {
    return { kind: "legacy" };
  }

  if (pathname === "/dashboard") {
    return { kind: "dashboard" };
  }

  const projectMatch = pathname.match(/^\/draw\/([^/]+)$/);
  if (projectMatch) {
    return {
      kind: "project",
      projectId: decodeURIComponent(projectMatch[1]),
    };
  }

  return { kind: "legacy" };
};

export const navigateToPath = (
  path: string,
  opts?: { replace?: boolean },
) => {
  if (opts?.replace) {
    window.history.replaceState({}, "", path);
  } else {
    window.history.pushState({}, "", path);
  }

  window.dispatchEvent(new Event(NAVIGATION_EVENT));
};

export const useAppRoute = () => {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRoute());

  useEffect(() => {
    const syncRoute = () => {
      setRoute(parseAppRoute());
    };

    window.addEventListener("popstate", syncRoute);
    window.addEventListener(NAVIGATION_EVENT, syncRoute);

    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener(NAVIGATION_EVENT, syncRoute);
    };
  }, []);

  return route;
};
