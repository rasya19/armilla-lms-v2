import "dotenv/config";
import { defineConfig } from "@prisma/config";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

for (const envPath of [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend", ".env"),
  path.resolve(process.cwd(), "..", ".env"),
]) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

export default defineConfig({
  schema: "backend/schema.prisma",
  migrations: { path: "backend/migrations" },
  ...(process.env.DIRECT_URL || process.env.DATABASE_URL
    ? { datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
    : {}),
});
