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

function createMockPool(): Pool {
  const mockClient = {
    query: async () => ({ rows: [] }),
    release: () => {},
  };
  return {
    query: async () => ({ rows: [] }),
    connect: async () => mockClient,
    on: () => undefined,
    end: async () => undefined,
  } as unknown as Pool;
}

function createMockPrisma(): PrismaClient {
  const noOpModel = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    count: async () => 0,
    groupBy: async () => [],
    create: async (d?: { data?: unknown }) => d?.data ?? {},
    createMany: async () => ({ count: 0 }),
    update: async (d?: { data?: unknown }) => d?.data ?? {},
    updateMany: async () => ({ count: 0 }),
    delete: async () => ({}),
    deleteMany: async () => ({ count: 0 }),
  };
  const mockPrisma: PrismaClient = new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (prop === "$transaction") {
        return async (arg: unknown) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          if (typeof arg === "function") return arg(mockPrisma);
          return [];
        };
      }
      if (prop === "$queryRaw" || prop === "$queryRawUnsafe") return async () => [];
      if (prop === "$executeRaw" || prop === "$executeRawUnsafe") return async () => 0;
      if (prop === "$connect" || prop === "$disconnect") return async () => undefined;
      return noOpModel;
    },
  });
  return mockPrisma;
}

let pool: Pool;
let loginPool: Pool;
let prisma: PrismaClient;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
      ...(process.env.VERCEL ? { max: 2, idleTimeoutMillis: 5000 } : {}),
    });
    pool.on("error", (error) => console.error("Kesalahan koneksi database:", error.message));
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    loginPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 10000,
      max: 2,
      idleTimeoutMillis: 5000,
    });
    loginPool.on("error", (error) => console.error("Kesalahan koneksi pembatas login:", error.message));
  } catch {
    console.warn("[AI Studio] Database not connected — using mock");
    pool = createMockPool();
    loginPool = createMockPool();
    prisma = createMockPrisma();
  }
} else {
  console.warn("[AI Studio] DATABASE_URL not set — using mock database");
  pool = createMockPool();
  loginPool = createMockPool();
  prisma = createMockPrisma();
}

export { pool, loginPool, prisma };
