import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import {
  getGlobalTheme,
  isGlobalThemeKey,
  normalizeThemeKey,
  resetInMemoryGlobalTheme,
  setGlobalTheme,
} from "./global-theme.js";
import { parseSchoolProfile, unwrapSchoolPayload } from "../frontend/src/components/schoolProfile.js";

test("global theme unifies all plans and includes violet", async () => {
  resetInMemoryGlobalTheme();
  assert.equal(isGlobalThemeKey("ocean"), true);
  assert.equal(isGlobalThemeKey("violet"), true);
  assert.equal(isGlobalThemeKey("emerald"), true);
  assert.equal(isGlobalThemeKey("sunset"), true);
  assert.equal(isGlobalThemeKey("dark"), true);
  assert.equal(isGlobalThemeKey("invalid"), false);
  assert.equal(normalizeThemeKey("VIOLET"), "violet");
  assert.equal(normalizeThemeKey("unknown", "ocean"), "ocean");

  let storedSetting: string | null = null;
  let bulkUpdatedTheme: string | null = null;
  const mockPrisma = {
    platformSetting: {
      findUnique: async () => (storedSetting ? { value: storedSetting } : null),
      upsert: async ({ update }: { update: { value: string } }) => {
        storedSetting = update.value;
        return { key: "global_theme", value: storedSetting };
      },
    },
    sekolah: {
      updateMany: async ({ data }: { data: { themeKey: string } }) => {
        bulkUpdatedTheme = data.themeKey;
        return { count: 12 };
      },
    },
  } as unknown as Parameters<typeof getGlobalTheme>[0];

  assert.equal(await getGlobalTheme(mockPrisma, "emerald"), "emerald");

  const updated = await setGlobalTheme(mockPrisma, "violet");
  assert.deepEqual(updated, { themeKey: "violet", updatedSchools: 12 });
  assert.equal(bulkUpdatedTheme, "violet");

  assert.equal(await getGlobalTheme(mockPrisma, "ocean"), "violet");
  assert.equal(await getGlobalTheme(mockPrisma, "dark"), "violet");
});

test("master and public global theme endpoints enforce master auth and validate themes", async () => {
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:5432/test";
  process.env.NODE_ENV = "production";
  process.env.VERCEL = "1";
  process.env.APP_ORIGIN = "https://pkbm.siput.id";
  process.env.LOGIN_RATE_LIMIT_SECRET = "cd".repeat(32);

  resetInMemoryGlobalTheme();
  const { prisma } = await import("./db.js");
  const { default: app } = await import("./server.js");

  let savedTheme = "ocean";
  const fakeSettingDelegate = {
    findUnique: async () => ({ value: savedTheme }),
    upsert: async ({ update }: { update: { value: string } }) => {
      savedTheme = update.value;
      return { key: "global_theme", value: savedTheme };
    },
  };
  Object.defineProperty(prisma, "platformSetting", {
    configurable: true,
    value: fakeSettingDelegate,
  });
  Object.defineProperty(prisma.sekolah, "updateMany", {
    configurable: true,
    value: async ({ data }: { data: { themeKey: string } }) => {
      savedTheme = data.themeKey;
      return { count: 5 };
    },
  });
  Object.defineProperty(prisma.sesiAkun, "findUnique", {
    configurable: true,
    value: async () => ({
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      akun: { id: "m1", nama: "Master Admin", email: "master@example.invalid", peran: "MASTER_ADMIN", aktif: true, sekolahId: null, sekolah: null },
    }),
  });

  const server = express()
    .use((req, _res, next) => {
      const testHost = req.get("x-test-host");
      if (testHost) req.headers.host = testHost;
      next();
    })
    .use(app)
    .listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const addr = server.address();
    assert.ok(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}`;
    const mainHeaders = { "x-test-host": "pkbm.siput.id", origin: "https://pkbm.siput.id", "content-type": "application/json" };

    assert.equal((await fetch(`${base}/api/master/tema`, { headers: mainHeaders })).status, 401);
    assert.equal((await fetch(`${base}/api/master/tema`, { method: "PATCH", headers: mainHeaders, body: JSON.stringify({ themeKey: "violet" }) })).status, 401);

    const authHeaders = { ...mainHeaders, cookie: `armilla_session=${"a".repeat(64)}` };
    assert.equal((await fetch(`${base}/api/master/tema`, { method: "PATCH", headers: authHeaders, body: JSON.stringify({ themeKey: "invalid" }) })).status, 400);

    const patched = await fetch(`${base}/api/master/tema`, {
      method: "PATCH",
      headers: authHeaders,
      body: JSON.stringify({ themeKey: "violet" }),
    });
    assert.equal(patched.status, 200);
    const patchedJson = (await patched.json()) as { success: boolean; themeKey: string; updated: number };
    assert.equal(patchedJson.success, true);
    assert.equal(patchedJson.themeKey, "violet");
    assert.equal(patchedJson.updated, 5);

    const pub = await fetch(`${base}/api/public/tema`, { headers: { "x-test-host": "pkbm.siput.id" } });
    assert.equal(pub.status, 200);
    assert.deepEqual(await pub.json(), { themeKey: "violet" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("schoolProfile parser accepts flat public school payloads and wrapped responses", () => {
  const flatSandboxPayload = {
    id: "sbx-1",
    nama: "Sandbox PKBM Rasyatech",
    slug: "sandbox",
    npsn: "P9999999",
    plan: "pro",
    status: "ACTIVE",
    themeKey: "ocean",
    logoUrl: null,
  };
  const parsedFlat = parseSchoolProfile(flatSandboxPayload);
  assert.ok(parsedFlat);
  assert.equal(parsedFlat.nama, "Sandbox PKBM Rasyatech");
  assert.equal(parsedFlat.npsn, "P9999999");
  assert.equal(parsedFlat.logoUrl, null);
  assert.equal(parsedFlat.alamatLengkap, null);

  const wrappedWithNameAlias = {
    data: {
      id: "sch-2",
      name: "PKBM Harapan",
      slug: "harapan",
      npsn: null,
      logoUrl: "https://example.invalid/logo.png",
    },
  };
  const unwrapped = unwrapSchoolPayload(wrappedWithNameAlias);
  assert.equal(unwrapped?.slug, "harapan");
  const parsedWrapped = parseSchoolProfile(wrappedWithNameAlias);
  assert.ok(parsedWrapped);
  assert.equal(parsedWrapped.nama, "PKBM Harapan");
  assert.equal(parsedWrapped.logoUrl, "https://example.invalid/logo.png");
});
