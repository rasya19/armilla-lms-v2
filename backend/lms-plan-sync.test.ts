import { strict as assert } from "node:assert";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { internalProvisionRouter } from "./internal-provision.js";
import {
  resolveLmsProvisionEndpoint,
  syncTenantPlanToLms,
  toCleanPlanCode,
} from "./lms-plan-sync.js";

test("resolveLmsProvisionEndpoint defaults to https://pkbm.siput.id/api/internal/provision", () => {
  assert.equal(
    resolveLmsProvisionEndpoint(undefined, true)?.toString(),
    "https://pkbm.siput.id/api/internal/provision",
  );
  assert.equal(
    resolveLmsProvisionEndpoint("https://pkbm.siput.id", true)?.toString(),
    "https://pkbm.siput.id/api/internal/provision",
  );
  assert.equal(
    resolveLmsProvisionEndpoint("https://pkbm.siput.id/api/internal/provision/", true)?.toString(),
    "https://pkbm.siput.id/api/internal/provision",
  );
  assert.equal(resolveLmsProvisionEndpoint("http://pkbm.siput.id", true), null);
});

test("toCleanPlanCode maps dropdown labels cleanly to basic, reguler, and pro", () => {
  assert.equal(toCleanPlanCode("Paket Basic"), "basic");
  assert.equal(toCleanPlanCode("basic"), "basic");
  assert.equal(toCleanPlanCode("Paket Reguler"), "reguler");
  assert.equal(toCleanPlanCode("REGULER"), "reguler");
  assert.equal(toCleanPlanCode("Paket Reguler (12 Bulan)"), "reguler");
  assert.equal(toCleanPlanCode("Paket Pro"), "pro");
  assert.equal(toCleanPlanCode("PRO"), "pro");
  assert.equal(toCleanPlanCode("Paket Pro (Tahunan)"), "pro");
  assert.equal(toCleanPlanCode("Pro - Annual"), "pro");
  assert.equal(toCleanPlanCode("tidak-valid"), null);
  assert.equal(toCleanPlanCode(123), null);
});

test("syncTenantPlanToLms syncs with internal provision router and surfaces specific LMS errors", async () => {
  const updates: Array<{ sekolahId?: string | null; npsn: string | null; slug: string | null; plan: string }> = [];
  const app = express();
  app.use(
    "/api/internal",
    internalProvisionRouter(
      {
        provision: async () => "unused",
        updateStatus: async (npsn) => npsn === "P1234567",
        getTheme: async () => null,
        updateTheme: async () => 0,
        updatePlan: async ({ sekolahId, npsn, slug, plan }) => {
          updates.push({ ...(sekolahId ? { sekolahId } : {}), npsn, slug, plan });
          if (npsn === "99999999" && slug === "tidakada") return null;
          return {
            id: sekolahId ?? "school-1",
            nama: "PKBM Armilla Nusa",
            slug: slug ?? "armillanusa",
            npsn: npsn ?? "P1234567",
            plan,
          };
        },
      },
      { secret: () => "sync-secret" },
    ),
  );

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const endpointUrl = `http://127.0.0.1:${address.port}/api/internal/provision`;

    const ok = await syncTenantPlanToLms(
      { npsn: "P1234567", slug: "armillanusa", plan: "pro" },
      { endpointUrl, token: "sync-secret", production: false },
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.status, 200);
    assert.equal(ok.plan, "pro");
    assert.deepEqual(updates, [{ npsn: "P1234567", slug: "armillanusa", plan: "pro" }]);

    const notFound = await syncTenantPlanToLms(
      { npsn: "99999999", slug: "tidakada", plan: "reguler" },
      { endpointUrl, token: "sync-secret", production: false },
    );
    assert.equal(notFound.ok, false);
    assert.equal(notFound.status, 404);
    assert.equal(notFound.error, "Tenant tidak ditemukan di LMS.");

    const badAuth = await syncTenantPlanToLms(
      { npsn: "P1234567", slug: "armillanusa", plan: "basic" },
      { endpointUrl, token: "wrong-secret", production: false },
    );
    assert.equal(badAuth.ok, false);
    assert.equal(badAuth.status, 401);
    assert.equal(badAuth.error, "Unauthorized.");

    const patchRes = await fetch(`http://127.0.0.1:${address.port}/api/internal/tenants/P1234567/plan`, {
      method: "PATCH",
      headers: { authorization: "Bearer sync-secret", "content-type": "application/json" },
      body: JSON.stringify({ plan: "Paket Reguler", slug: "armillanusa" }),
    });
    assert.equal(patchRes.status, 200);
    assert.equal((await patchRes.json()).plan, "reguler");

    const postPlanRes = await fetch(`http://127.0.0.1:${address.port}/api/internal/tenants/P1234567/plan`, {
      method: "POST",
      headers: { authorization: "Bearer sync-secret", "content-type": "application/json" },
      body: JSON.stringify({ paket: "Paket Pro (Tahunan)", subdomain: "pkbm-armilla.pkbm.siput.id" }),
    });
    assert.equal(postPlanRes.status, 200);
    const postPlanJson = await postPlanRes.json();
    assert.equal(postPlanJson.plan, "pro");
    assert.equal(postPlanJson.sekolah.slug, "pkbm-armilla");

    const statusWithPlanRes = await fetch(`http://127.0.0.1:${address.port}/api/internal/tenants/P1234567/status`, {
      method: "PATCH",
      headers: { authorization: "Bearer sync-secret", "content-type": "application/json" },
      body: JSON.stringify({ status: "ACTIVE", expiresAt: "2099-12-31T23:59:59Z", plan: "Paket Pro" }),
    });
    assert.equal(statusWithPlanRes.status, 200);
    assert.equal((await statusWithPlanRes.json()).plan, "pro");
  } finally {
    server.close();
    await once(server, "close");
  }
});
