import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import app from "./server.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.basename(currentDir) === "dist" ? path.resolve(currentDir, "../..") : path.resolve(currentDir, "..");
const frontendDist = path.join(rootDir, "frontend", "dist");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
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
