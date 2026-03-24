const getCloudApiBase = () => {
  if (import.meta.env.VITE_APP_CLOUD_API_URL) {
    return import.meta.env.VITE_APP_CLOUD_API_URL.replace(/\/$/, "");
  }
  if (
    typeof window !== "undefined" &&
    window.location.hostname !== "localhost"
  ) {
    return `${window.location.origin}/api`;
  }
  return "http://localhost:3004/api";
};

const CLOUD_API_BASE = getCloudApiBase();

const AUTH_STORAGE_KEY = "excalidraw:cloud-auth-token";
const AUTH_CHANGE_EVENT = "excalidraw-cloud:auth-change";

export type CloudAuthUser = {
  id: string;
  name: string;
  email: string;
};

export type CloudAuthSession = {
  user: CloudAuthUser;
  expiresAt: string;
};

type AuthPayload = CloudAuthSession & {
  token: string;
};

type CloudRequestInit = RequestInit & {
  skipAuth?: boolean;
};

export class CloudAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CloudAuthError";
    this.status = status;
  }
}

const emitAuthChange = () => {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

const readJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : ({} as T);
};

export const getStoredCloudAuthToken = () => {
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
};

export const setStoredCloudAuthToken = (token: string) => {
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  emitAuthChange();
};

export const clearStoredCloudAuthToken = () => {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  emitAuthChange();
};

export const subscribeToCloudAuthChange = (onChange: () => void) => {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === AUTH_STORAGE_KEY) {
      onChange();
    }
  };

  window.addEventListener(AUTH_CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
};

export const cloudRequest = async <T>(
  path: string,
  init?: CloudRequestInit,
): Promise<T> => {
  const headers = new Headers(init?.headers);

  if (
    !headers.has("Content-Type") &&
    init?.body &&
    !(init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (!init?.skipAuth) {
    const token = getStoredCloudAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(`${CLOUD_API_BASE}${path}`, {
    ...init,
    headers,
  });

  const payload = await readJson<T & { message?: string }>(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredCloudAuthToken();
      throw new CloudAuthError(payload.message || "Unauthorized", 401);
    }

    throw new Error(payload.message || "Cloud request failed.");
  }

  return payload;
};

const consumeAuthPayload = (payload: AuthPayload): CloudAuthSession => {
  setStoredCloudAuthToken(payload.token);

  return {
    user: payload.user,
    expiresAt: payload.expiresAt,
  };
};

export const fetchCloudAuthSession = async () => {
  return cloudRequest<CloudAuthSession>("/auth/session", {
    method: "GET",
  });
};

export const signUpToCloud = async ({
  name,
  email,
  password,
}: {
  name: string;
  email: string;
  password: string;
}) => {
  const payload = await cloudRequest<AuthPayload>("/auth/sign-up", {
    method: "POST",
    body: JSON.stringify({
      name,
      email,
      password,
    }),
    skipAuth: true,
  });

  return consumeAuthPayload(payload);
};

export const signInToCloud = async ({
  email,
  password,
}: {
  email: string;
  password: string;
}) => {
  const payload = await cloudRequest<AuthPayload>("/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
    skipAuth: true,
  });

  return consumeAuthPayload(payload);
};

export const signOutFromCloud = async () => {
  try {
    await cloudRequest<{ ok: boolean }>("/auth/sign-out", {
      method: "POST",
    });
  } finally {
    clearStoredCloudAuthToken();
  }
};
