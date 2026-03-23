import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "../..");
const cloudBackendDir = resolve(__dirname, "..");
const envPath = resolve(cloudBackendDir, ".env");
const schemaPath = "./cloud-backend/prisma/schema.prisma";
const prismaBin = resolve(
  rootDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "prisma.cmd" : "prisma",
);

dotenv.config({ path: envPath });

const passthroughArgs = process.argv.slice(2);
const args = passthroughArgs.includes("--schema")
  ? passthroughArgs
  : [...passthroughArgs, "--schema", schemaPath];

const quoteArg = (arg) =>
  /[\s"]/u.test(arg) ? `"${arg.replace(/"/gu, '""')}"` : arg;

const child =
  process.platform === "win32"
    ? spawn(
        process.env.comspec || "cmd.exe",
        ["/d", "/s", "/c", `npx prisma ${args.map(quoteArg).join(" ")}`],
        {
          cwd: rootDir,
          env: process.env,
          stdio: "inherit",
        },
      )
    : spawn(prismaBin, args, {
        cwd: rootDir,
        env: process.env,
        stdio: "inherit",
      });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
