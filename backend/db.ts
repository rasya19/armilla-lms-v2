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

type GlobalDbState = {
  __armillaPool?: Pool;
  __armillaLoginPool?: Pool;
  __armillaPrisma?: PrismaClient;
};

const globalForDb = globalThis as typeof globalThis & GlobalDbState;

let pool: Pool;
let loginPool: Pool;
let prisma: PrismaClient;

if (process.env.DATABASE_URL) {
  try {
    pool =
      globalForDb.__armillaPool ??
      new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 8000,
        idleTimeoutMillis: 15000,
        max: process.env.VERCEL ? 3 : 10,
      });
    if (!globalForDb.__armillaPool) {
      pool.on("error", (error) => console.error("Kesalahan koneksi database:", error.message));
      globalForDb.__armillaPool = pool;
    }

    prisma =
      globalForDb.__armillaPrisma ??
      new PrismaClient({ adapter: new PrismaPg(pool) });
    if (!globalForDb.__armillaPrisma) {
      globalForDb.__armillaPrisma = prisma;
    }

    loginPool =
      globalForDb.__armillaLoginPool ??
      new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 8000,
        max: 2,
        idleTimeoutMillis: 10000,
      });
    if (!globalForDb.__armillaLoginPool) {
      loginPool.on("error", (error) => console.error("Kesalahan koneksi pembatas login:", error.message));
      globalForDb.__armillaLoginPool = loginPool;
    }
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
