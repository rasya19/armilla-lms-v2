import express from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import app from "./server.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(currentDir) === "dist" ? path.resolve(currentDir, "../..") : path.resolve(currentDir, "..");
const frontendDir = path.join(rootDir, "frontend");
const frontendDist = path.join(frontendDir, "dist");
const frontendIndex = path.join(frontendDist, "index.html");

function latestMtimeMs(targetPath: string): number {
  if (!fs.existsSync(targetPath)) return 0;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const childNewest = latestMtimeMs(path.join(targetPath, entry.name));
    if (childNewest > newest) newest = childNewest;
  }
  return newest;
}

function isFrontendBuildNeeded(): boolean {
  if (!fs.existsSync(frontendIndex)) return true;
  const distMtime = fs.statSync(frontendIndex).mtimeMs;
  const watchTargets = [
    path.join(frontendDir, "src"),
    path.join(frontendDir, "public"),
    path.join(frontendDir, "index.html"),
    path.join(frontendDir, "vite.config.ts"),
    path.join(frontendDir, "package.json"),
  ];
  return watchTargets.some((target) => latestMtimeMs(target) > distMtime);
}

let frontendBuildPromise: Promise<void> | null = null;

function ensureFrontendBuild(): Promise<void> | null {
  if (frontendBuildPromise) return frontendBuildPromise;
  if (!isFrontendBuildNeeded()) return null;

  frontendBuildPromise = new Promise<void>((resolve) => {
    console.log("[dev] Membangun frontend di latar belakang...");
    const child = spawn("npm", ["run", "build:frontend"], {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[dev] Build frontend selesai dengan kode ${code ?? "unknown"}.`);
      }
      frontendBuildPromise = null;
      resolve();
    });
    child.on("error", (error) => {
      console.error("[dev] Gagal menjalankan build frontend:", error.message);
      frontendBuildPromise = null;
      resolve();
    });
  });

  return frontendBuildPromise;
}

if (process.env.NODE_ENV !== "production") {
  ensureFrontendBuild();
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    const pending = frontendBuildPromise;
    if (!pending) return next();
    pending.then(() => next(), () => next());
  });
}

if (process.env.NODE_ENV !== "production" || fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    if (!fs.existsSync(frontendIndex)) {
      res.status(503).send("Frontend sedang disiapkan, silakan muat ulang sebentar lagi.");
      return;
    }
    res.sendFile(frontendIndex);
  });
}

const rawPort = process.env.PORT;
const port = Number(
  rawPort && rawPort !== process.env.NGINX_PORT
    ? rawPort
    : process.env.DEFAULT_APP_PORT || 3000,
);
const host = process.env.HOST || "0.0.0.0";
app.listen(port, host, () => console.log(`Server berjalan di http://${host}:${port}`));
