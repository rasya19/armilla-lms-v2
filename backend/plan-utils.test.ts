import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hasPlanAccess, normalizeTenantPlan } from "./plan-utils.js";

test("normalizeTenantPlan handles case-insensitivity and legacy plan names", () => {
  assert.equal(normalizeTenantPlan(undefined), "basic");
  assert.equal(normalizeTenantPlan(null), "basic");
  assert.equal(normalizeTenantPlan(""), "basic");
  assert.equal(normalizeTenantPlan("Basic"), "basic");
  assert.equal(normalizeTenantPlan("  PAKET BASIC "), "basic");
  assert.equal(normalizeTenantPlan("Standar"), "basic");
  assert.equal(normalizeTenantPlan("Paket Standar"), "basic");

  assert.equal(normalizeTenantPlan("Reguler"), "reguler");
  assert.equal(normalizeTenantPlan("REGULER"), "reguler");
  assert.equal(normalizeTenantPlan("Paket Reguler"), "reguler");
  assert.equal(normalizeTenantPlan("Regular"), "reguler");

  assert.equal(normalizeTenantPlan("Pro"), "pro");
  assert.equal(normalizeTenantPlan("PAKET PRO"), "pro");
  assert.equal(normalizeTenantPlan("Tahunan"), "pro");
  assert.equal(normalizeTenantPlan("Paket Tahunan"), "pro");
  assert.equal(normalizeTenantPlan("Enterprise"), "pro");
  assert.equal(normalizeTenantPlan("Paket Enterprise"), "pro");
});

test("hasPlanAccess enforces basic < reguler < pro hierarchy", () => {
  assert.equal(hasPlanAccess("basic", "basic"), true);
  assert.equal(hasPlanAccess("basic", "reguler"), false);
  assert.equal(hasPlanAccess("basic", "pro"), false);

  assert.equal(hasPlanAccess("reguler", "basic"), true);
  assert.equal(hasPlanAccess("reguler", "reguler"), true);
  assert.equal(hasPlanAccess("reguler", "pro"), false);

  assert.equal(hasPlanAccess("pro", "basic"), true);
  assert.equal(hasPlanAccess("pro", "reguler"), true);
  assert.equal(hasPlanAccess("pro", "pro"), true);
});
