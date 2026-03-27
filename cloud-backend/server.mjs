import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import dotenv from "dotenv";
import { v2 as cloudinary } from "cloudinary";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const loadPrismaClient = async () => {
  const candidates = [
    path.resolve(repoRoot, "node_modules/@prisma/client/index.js"),
    path.resolve(
      repoRoot,
      "examples/with-nextjs/node_modules/@prisma/client/index.js",
    ),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }

  throw new Error(
    "Unable to resolve @prisma/client. Run `yarn cloud:prisma:generate` first.",
  );
};

const { PrismaClient } = await loadPrismaClient();

dotenv.config({ path: path.resolve(repoRoot, "examples/with-nextjs/.env") });
dotenv.config({ path: path.resolve(__dirname, ".env"), override: true });

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    if (process.env.VERCEL) {
      // Return empty string or handle missing env vars gracefully on Vercel
      return "";
    }
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

const config = {
  port: Number(process.env.CLOUD_BACKEND_PORT || 3004),
  databaseUrl: required("DATABASE_URL"),
  cloudinaryCloudName: required("CLOUDINARY_CLOUD_NAME"),
  cloudinaryApiKey: required("CLOUDINARY_API_KEY"),
  cloudinaryApiSecret: required("CLOUDINARY_API_SECRET"),
};

cloudinary.config({
  cloud_name: config.cloudinaryCloudName,
  api_key: config.cloudinaryApiKey,
  api_secret: config.cloudinaryApiSecret,
  secure: true,
});

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.databaseUrl,
    },
  },
  log: ["error"],
});

const getCorsHeaders = (_origin, requestHeaders) => {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers":
      requestHeaders || "Content-Type, Authorization",
  };
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const CREDENTIALS_PROVIDER_ID = "credentials";

const EMPTY_SCENE_DATA = {
  elements: [],
  appState: {},
};

const isDeprecatedBlankCloudScene = (candidate) => {
  const appState =
    candidate.appState && typeof candidate.appState === "object"
      ? candidate.appState
      : null;

  if (
    !appState ||
    !Array.isArray(candidate.elements) ||
    candidate.elements.length
  ) {
    return false;
  }

  const keys = Object.keys(appState);
  return (
    appState.viewBackgroundColor === "#0f172a" &&
    appState.gridModeEnabled === false &&
    keys.every(
      (key) => key === "viewBackgroundColor" || key === "gridModeEnabled",
    )
  );
};

const projectRooms = new Map();

const normalizeSceneData = (sceneData) => {
  if (!sceneData || typeof sceneData !== "object") {
    return EMPTY_SCENE_DATA;
  }

  const candidate = sceneData;

  if (isDeprecatedBlankCloudScene(candidate)) {
    return EMPTY_SCENE_DATA;
  }

  return {
    elements: Array.isArray(candidate.elements)
      ? candidate.elements
      : EMPTY_SCENE_DATA.elements,
    appState:
      candidate.appState && typeof candidate.appState === "object"
        ? candidate.appState
        : EMPTY_SCENE_DATA.appState,
  };
};

const asJson = (value) => JSON.parse(JSON.stringify(value));

const normalizeProjectName = (name) => {
  if (typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "Untitled project";
  }

  return trimmed.slice(0, 120);
};

const normalizeEmail = (email) => {
  if (typeof email !== "string") {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.includes("@") ? normalized : null;
};

const normalizeUserName = (name) => {
  if (typeof name !== "string") {
    return null;
  }

  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 80) : null;
};

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
};

const verifyPassword = async (password, storedHash) => {
  if (typeof storedHash !== "string") {
    return false;
  }

  const [algorithm, saltHex, hashHex] = storedHash.split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const derivedKey = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, expected.length, (error, key) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(key);
    });
  });

  return crypto.timingSafeEqual(expected, derivedKey);
};

const createSession = async (req, userId) => {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      ipAddress: req.socket.remoteAddress ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    },
  });

  return { token, expiresAt };
};

const getAuthTokenFromRequest = (req) => {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }

  return null;
};

const getSessionByToken = async (token) => {
  if (!token) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  return session;
};

const getAuthenticatedSession = async (req) => {
  return getSessionByToken(getAuthTokenFromRequest(req));
};

const serializeAuthUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

const serializeAssetFile = (asset) => ({
  id: asset.fileId,
  mimeType: asset.mimeType,
  dataURL: asset.deliveryUrl,
  created: asset.createdAt.getTime(),
  lastRetrieved: Date.now(),
});

const serializeProjectSummary = (project) => ({
  id: project.id,
  name: project.name,
  thumbnailUrl: project.thumbnailUrl,
  lastSavedAt: project.lastSavedAt?.toISOString() ?? null,
  updatedAt: project.updatedAt.toISOString(),
  revision: project.revision,
});

const serializeProject = (project) => {
  const sceneData = normalizeSceneData(project.sceneData);

  return {
    id: project.id,
    name: project.name,
    thumbnailUrl: project.thumbnailUrl,
    lastSavedAt: project.lastSavedAt?.toISOString() ?? null,
    revision: project.revision,
    initialData: {
      elements: sceneData.elements,
      appState: sceneData.appState,
      files: Object.fromEntries(
        project.assets.map((asset) => [
          asset.fileId,
          serializeAssetFile(asset),
        ]),
      ),
    },
  };
};

const writeJson = (res, statusCode, payload, req) => {
  res.writeHead(statusCode, {
    ...getCorsHeaders(
      req?.headers?.origin,
      req?.headers?.["access-control-request-headers"],
    ),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
};

const readJson = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const getProjectIdFromPath = (pathname) => {
  const match = pathname.match(/^\/api\/projects\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
};

const getProjectRoom = (projectId) => {
  if (!projectRooms.has(projectId)) {
    projectRooms.set(projectId, new Map());
  }
  return projectRooms.get(projectId);
};

const serializeCollaborator = (client) => ({
  clientId: client.clientId,
  username: client.username,
  pointer: client.pointer,
  button: client.button,
  selectedElementIds: client.selectedElementIds,
  userState: client.userState,
});

const broadcastToProject = (projectId, payload, opts = {}) => {
  const room = projectRooms.get(projectId);
  if (!room) {
    return;
  }

  const message = JSON.stringify(payload);
  for (const [clientId, client] of room) {
    if (opts.excludeClientId && opts.excludeClientId === clientId) {
      continue;
    }
    if (client.ws.readyState === 1) {
      client.ws.send(message);
    }
  }
};

const broadcastCollaborators = (projectId) => {
  const room = projectRooms.get(projectId);
  if (!room) {
    return;
  }

  broadcastToProject(projectId, {
    type: "collaborators",
    collaborators: [...room.values()].map(serializeCollaborator),
  });
};

const uploadDataUrl = async ({ dataURL, folder, publicId, format }) => {
  return cloudinary.uploader.upload(dataURL, {
    folder,
    public_id: publicId,
    overwrite: true,
    resource_type: "image",
    format,
  });
};

const handleAuthRequest = async (req, res, url) => {
  if (req.method === "GET" && url.pathname === "/api/auth/session") {
    const session = await getAuthenticatedSession(req);

    if (!session) {
      writeJson(res, 401, { message: "Unauthorized" });
      return;
    }

    writeJson(res, 200, {
      user: serializeAuthUser(session.user),
      expiresAt: session.expiresAt.toISOString(),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/sign-up") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = normalizeUserName(body.name);
    const password =
      typeof body.password === "string" ? body.password.trim() : "";

    if (!name || !email || password.length < 6) {
      writeJson(res, 400, {
        message:
          "Name, valid email, and a password with 6+ characters are required.",
      });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      writeJson(res, 409, {
        message: "An account with this email already exists.",
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        emailVerified: true,
        accounts: {
          create: {
            providerId: CREDENTIALS_PROVIDER_ID,
            accountId: email,
            password: passwordHash,
          },
        },
      },
    });

    const session = await createSession(req, user.id);

    writeJson(res, 201, {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: serializeAuthUser(user),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/sign-in") {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const password =
      typeof body.password === "string" ? body.password.trim() : "";

    if (!email || !password) {
      writeJson(res, 400, { message: "Email and password are required." });
      return;
    }

    const account = await prisma.account.findFirst({
      where: {
        providerId: CREDENTIALS_PROVIDER_ID,
        accountId: email,
      },
      include: {
        user: true,
      },
    });

    const isValid =
      account?.password && (await verifyPassword(password, account.password));

    if (!account || !isValid) {
      writeJson(res, 401, { message: "Invalid email or password." });
      return;
    }

    const session = await createSession(req, account.userId);

    writeJson(res, 200, {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: serializeAuthUser(account.user),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/sign-out") {
    const token = getAuthTokenFromRequest(req);

    if (token) {
      await prisma.session.deleteMany({
        where: {
          token,
        },
      });
    }

    writeJson(res, 200, { ok: true });
    return;
  }

  writeJson(res, 404, { message: "Not found" });
};

const handleProjectsRequest = async (req, res, url, owner) => {
  const projectId = getProjectIdFromPath(url.pathname);

  if (req.method === "GET" && url.pathname === "/api/projects") {
    const projects = await prisma.project.findMany({
      where: {
        ownerId: owner.id,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        thumbnailUrl: true,
        lastSavedAt: true,
        updatedAt: true,
        revision: true,
      },
    });

    writeJson(res, 200, { projects: projects.map(serializeProjectSummary) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const project = await prisma.project.create({
      data: {
        ownerId: owner.id,
        name: `Untitled ${new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date())}`,
        sceneData: asJson(EMPTY_SCENE_DATA),
      },
      select: {
        id: true,
      },
    });

    writeJson(res, 201, project);
    return;
  }

  if (!projectId) {
    writeJson(res, 404, { message: "Not found" });
    return;
  }

  if (req.method === "GET" && url.pathname === `/api/projects/${projectId}`) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      include: {
        assets: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    if (!project) {
      writeJson(res, 404, { message: "Project not found" }, req);
      return;
    }

    writeJson(res, 200, serializeProject(project));
    return;
  }

  if (req.method === "PATCH" && url.pathname === `/api/projects/${projectId}`) {
    const body = await readJson(req);
    const nextName = normalizeProjectName(body.name);
    const hasSceneUpdate =
      body.sceneData &&
      typeof body.sceneData === "object" &&
      !Array.isArray(body.sceneData);
    const hasNameUpdate = typeof body.name === "string";

    if (!hasSceneUpdate && !hasNameUpdate) {
      writeJson(res, 400, { message: "Nothing to update" });
      return;
    }

    if (hasSceneUpdate) {
      const sceneData = normalizeSceneData(body.sceneData);
      const updated = await prisma.project.updateMany({
        where: {
          id: projectId,
          ownerId: owner.id,
          ...(typeof body.revision === "number"
            ? { revision: body.revision }
            : {}),
        },
        data: {
          ...(hasNameUpdate && nextName ? { name: nextName } : {}),
          sceneData: asJson(sceneData),
          lastSavedAt: new Date(),
          revision: {
            increment: 1,
          },
        },
      });

      if (!updated.count) {
        const current = await prisma.project.findFirst({
          where: {
            id: projectId,
            ownerId: owner.id,
          },
          select: {
            revision: true,
            lastSavedAt: true,
          },
        });

        if (!current) {
          writeJson(res, 404, { message: "Project not found" });
          return;
        }

        writeJson(res, 409, {
          message: "Revision conflict",
          revision: current.revision ?? null,
          lastSavedAt: current.lastSavedAt?.toISOString() ?? null,
        });
        return;
      }

      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          ownerId: owner.id,
        },
        select: {
          name: true,
          revision: true,
          lastSavedAt: true,
          updatedAt: true,
        },
      });

      writeJson(res, 200, {
        name: project?.name ?? nextName ?? "Untitled project",
        revision: project?.revision ?? body.revision ?? 0,
        lastSavedAt:
          project?.lastSavedAt?.toISOString() ?? new Date().toISOString(),
        updatedAt:
          project?.updatedAt?.toISOString() ?? new Date().toISOString(),
      });
      return;
    }

    const updated = await prisma.project.updateMany({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      data: {
        name: nextName ?? "Untitled project",
      },
    });

    if (!updated.count) {
      writeJson(res, 404, { message: "Project not found" });
      return;
    }

    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      select: {
        name: true,
        revision: true,
        lastSavedAt: true,
        updatedAt: true,
      },
    });

    writeJson(res, 200, {
      name: project?.name ?? nextName ?? "Untitled project",
      revision: project?.revision ?? 0,
      lastSavedAt: project?.lastSavedAt?.toISOString() ?? null,
      updatedAt: project?.updatedAt?.toISOString() ?? new Date().toISOString(),
    });
    return;
  }

  if (
    req.method === "DELETE" &&
    url.pathname === `/api/projects/${projectId}`
  ) {
    const deleted = await prisma.project.deleteMany({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
    });

    if (!deleted.count) {
      writeJson(res, 404, { message: "Project not found" });
      return;
    }

    const room = projectRooms.get(projectId);
    if (room) {
      for (const client of room.values()) {
        if (client.ws.readyState === 1) {
          client.ws.send(
            JSON.stringify({
              type: "error",
              message: "This project was deleted.",
            }),
          );
          client.ws.close(1008, "Project deleted");
        }
      }
      projectRooms.delete(projectId);
    }

    writeJson(res, 200, { id: projectId });
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname === `/api/projects/${projectId}/assets`
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      writeJson(res, 404, { message: "Project not found" });
      return;
    }

    const body = await readJson(req);

    if (
      typeof body.fileId !== "string" ||
      typeof body.mimeType !== "string" ||
      typeof body.dataURL !== "string"
    ) {
      writeJson(res, 400, { message: "Invalid asset payload" });
      return;
    }

    const uploaded = await uploadDataUrl({
      dataURL: body.dataURL,
      folder: "excalidraw/projects/assets",
      publicId: `${projectId}-${body.fileId}`,
    });

    const asset = await prisma.projectAsset.upsert({
      where: {
        projectId_fileId: {
          projectId,
          fileId: body.fileId,
        },
      },
      update: {
        mimeType: body.mimeType,
        secureUrl: uploaded.secure_url,
        deliveryUrl: uploaded.secure_url,
        cloudinaryPublicId: uploaded.public_id,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        bytes: uploaded.bytes ?? null,
      },
      create: {
        projectId,
        fileId: body.fileId,
        mimeType: body.mimeType,
        secureUrl: uploaded.secure_url,
        deliveryUrl: uploaded.secure_url,
        cloudinaryPublicId: uploaded.public_id,
        width: uploaded.width ?? null,
        height: uploaded.height ?? null,
        bytes: uploaded.bytes ?? null,
      },
    });

    const payload = {
      fileId: asset.fileId,
      mimeType: asset.mimeType,
      deliveryUrl: asset.deliveryUrl,
      file: serializeAssetFile(asset),
    };

    broadcastToProject(projectId, {
      type: "asset-updated",
      asset: payload,
    });

    writeJson(res, 200, payload);
    return;
  }

  if (
    req.method === "POST" &&
    url.pathname === `/api/projects/${projectId}/thumbnail`
  ) {
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      select: {
        id: true,
      },
    });

    if (!project) {
      writeJson(res, 404, { message: "Project not found" });
      return;
    }

    const body = await readJson(req);

    if (typeof body.dataURL !== "string") {
      writeJson(res, 400, { message: "Invalid thumbnail payload" }, req);
      return;
    }

    const uploaded = await uploadDataUrl({
      dataURL: body.dataURL,
      folder: "excalidraw/projects/thumbnails",
      publicId: `thumbnail-${projectId}`,
      format: "webp",
    });

    await prisma.project.updateMany({
      where: {
        id: projectId,
        ownerId: owner.id,
      },
      data: {
        thumbnailUrl: uploaded.secure_url,
      },
    });

    writeJson(res, 200, { thumbnailUrl: uploaded.secure_url }, req);
    return;
  }

  writeJson(res, 404, { message: "Not found" }, req);
};

const requestHandler = async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const normalizedPathname = url.pathname.startsWith("/api/")
      ? url.pathname
      : `/api${url.pathname}`;
    if (normalizedPathname !== url.pathname) {
      url.pathname = normalizedPathname;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(
        204,
        getCorsHeaders(
          req.headers.origin,
          req.headers["access-control-request-headers"],
        ),
      );
      res.end();
      return;
    }

    if (url.pathname === "/api/health") {
      writeJson(res, 200, { ok: true }, req);
      return;
    }

    if (url.pathname.startsWith("/api/auth")) {
      await handleAuthRequest(req, res, url);
      return;
    }

    if (url.pathname.startsWith("/api/projects")) {
      const session = await getAuthenticatedSession(req);
      if (!session) {
        writeJson(res, 401, { message: "Unauthorized" }, req);
        return;
      }

      await handleProjectsRequest(req, res, url, session.user);
      return;
    }

    writeJson(res, 404, { message: "Not found" }, req);
  } catch (error) {
    console.error(error);
    writeJson(
      res,
      500,
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      req,
    );
  }
};

const server = http.createServer(requestHandler);

const wss = new WebSocketServer({
  noServer: true,
  path: "/ws",
});

server.on("upgrade", (request, socket, head) => {
  if (
    new URL(request.url, `http://${request.headers.host}`).pathname === "/ws"
  ) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws) => {
  const client = {
    clientId: crypto.randomUUID(),
    ws,
    userId: null,
    projectId: null,
    username: "Guest",
    pointer: null,
    button: "up",
    selectedElementIds: {},
    userState: "active",
  };

  const leaveCurrentProject = () => {
    if (!client.projectId) {
      return;
    }
    const room = projectRooms.get(client.projectId);
    if (!room) {
      client.projectId = null;
      return;
    }

    room.delete(client.clientId);
    if (!room.size) {
      projectRooms.delete(client.projectId);
    } else {
      broadcastCollaborators(client.projectId);
    }

    client.projectId = null;
  };

  ws.on("message", async (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      switch (message.type) {
        case "join-project": {
          if (
            typeof message.projectId !== "string" ||
            typeof message.token !== "string"
          ) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "projectId and token are required",
              }),
            );
            return;
          }

          const session = await getSessionByToken(message.token);
          if (!session) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Unauthorized",
              }),
            );
            ws.close(4401, "Unauthorized");
            return;
          }

          leaveCurrentProject();

          client.userId = session.user.id;
          client.projectId = message.projectId;
          client.username = session.user.name || session.user.email || "Guest";

          const project = await prisma.project.findFirst({
            where: {
              id: message.projectId,
              ownerId: session.user.id,
            },
            include: {
              assets: {
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          });

          if (!project) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Project not found",
              }),
            );
            client.projectId = null;
            return;
          }

          const room = getProjectRoom(message.projectId);
          room.set(client.clientId, client);

          ws.send(
            JSON.stringify({
              type: "project-init",
              clientId: client.clientId,
              project: serializeProject(project),
              collaborators: [...room.values()].map(serializeCollaborator),
            }),
          );

          broadcastCollaborators(message.projectId);
          return;
        }

        case "scene-update": {
          if (!client.projectId || typeof message.sceneData !== "object") {
            return;
          }

          broadcastToProject(
            client.projectId,
            {
              type: "scene-update",
              clientId: client.clientId,
              sceneData: normalizeSceneData(message.sceneData),
            },
            { excludeClientId: client.clientId },
          );
          return;
        }

        case "pointer-update": {
          if (!client.projectId) {
            return;
          }

          client.pointer =
            message.pointer && typeof message.pointer === "object"
              ? message.pointer
              : null;
          client.button = message.button === "down" ? "down" : "up";
          client.selectedElementIds =
            message.selectedElementIds &&
            typeof message.selectedElementIds === "object"
              ? message.selectedElementIds
              : {};
          if (typeof message.userState === "string") {
            client.userState = message.userState;
          }

          broadcastCollaborators(client.projectId);
          return;
        }

        default: {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Unsupported message type",
            }),
          );
        }
      }
    } catch (error) {
      console.error(error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Invalid socket payload",
        }),
      );
    }
  });

  ws.on("close", () => {
    leaveCurrentProject();
  });
});

if (!process.env.VERCEL) {
  server.listen(config.port, () => {
    console.log(`Cloud backend listening on http://localhost:${config.port}`);
  });
}

export default requestHandler;

const shutdown = async () => {
  wss.close();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
