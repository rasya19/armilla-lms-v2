import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.basename(moduleDir) === "dist" ? path.dirname(moduleDir) : moduleDir;
dotenv.config({ path: path.join(backendDir, ".env"), quiet: true });
dotenv.config({ path: path.join(backendDir, "..", ".env"), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL belum diatur.");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, ...(process.env.VERCEL ? { max: 2, idleTimeoutMillis: 5000 } : {}) });
pool.on("error", (error) => console.error("Kesalahan koneksi database:", error.message));
export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
export const loginPool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2, idleTimeoutMillis: 5000 });
loginPool.on("error", (error) => console.error("Kesalahan koneksi pembatas login:", error.message));
