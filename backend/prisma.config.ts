import { defineConfig } from "@prisma/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(backendDir, ".env"), quiet: true });
dotenv.config({ path: path.join(backendDir, "..", ".env"), quiet: true });

export default defineConfig({
  schema: "schema.prisma",
  migrations: { path: "migrations" },
  ...(process.env.DIRECT_URL || process.env.DATABASE_URL
    ? { datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
    : {}),
});
