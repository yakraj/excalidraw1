import { useCallback, useEffect, useState } from "react";

import {
  CloudAuthError,
  fetchCloudAuthSession,
  getStoredCloudAuthToken,
  signInToCloud,
  signOutFromCloud,
  signUpToCloud,
  subscribeToCloudAuthChange,
} from "./auth";

import type { CloudAuthSession } from "./auth";

export type CloudAuthStatus = "loading" | "authenticated" | "anonymous";

export const useCloudAuthSession = () => {
  const [status, setStatus] = useState<CloudAuthStatus>(() =>
    getStoredCloudAuthToken() ? "loading" : "anonymous",
  );
  const [session, setSession] = useState<CloudAuthSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredCloudAuthToken();

    if (!token) {
      setSession(null);
      setStatus("anonymous");
      setError(null);
      return null;
    }

    setStatus((current) => (current === "authenticated" ? current : "loading"));

    try {
      const nextSession = await fetchCloudAuthSession();
      setSession(nextSession);
      setStatus("authenticated");
      setError(null);
      return nextSession;
    } catch (refreshError) {
      if (refreshError instanceof CloudAuthError && refreshError.status === 401) {
        setSession(null);
        setStatus("anonymous");
        setError(null);
        return null;
      }

      setSession(null);
      setStatus("anonymous");
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to restore your cloud session.",
      );
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();

    return subscribeToCloudAuthChange(() => {
      void refresh();
    });
  }, [refresh]);

  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }) => {
      const nextSession = await signInToCloud({ email, password });
      setSession(nextSession);
      setStatus("authenticated");
      setError(null);
      return nextSession;
    },
    [],
  );

  const signUp = useCallback(
    async ({
      name,
      email,
      password,
    }: {
      name: string;
      email: string;
      password: string;
    }) => {
      const nextSession = await signUpToCloud({ name, email, password });
      setSession(nextSession);
      setStatus("authenticated");
      setError(null);
      return nextSession;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await signOutFromCloud();
    setSession(null);
    setStatus("anonymous");
    setError(null);
  }, []);

  return {
    status,
    session,
    error,
    refresh,
    signIn,
    signUp,
    signOut,
  };
};
