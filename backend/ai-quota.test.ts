import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_QUOTA_BY_PLAN,
  PRO_AI_MONTHLY_LIMITS,
  evaluateAiQuotaGate,
  getCurrentQuotaMonthKey,
  getNextResetDateLabel,
  maskGeminiApiKey,
  type SchoolAiQuotaSummary,
} from "./ai-quota.js";

function makeSummary(overrides: Partial<SchoolAiQuotaSummary> = {}): SchoolAiQuotaSummary {
  return {
    plan: "pro",
    isPro: true,
    monthKey: "2026-11",
    resetDateLabel: "1 Desember 2026",
    hasFallbackKey: false,
    maskedFallbackKey: null,
    cbtGenerate: { limit: 25, used: 0, remaining: 25 },
    assistant: { limit: 400, used: 0, remaining: 400 },
    ...overrides,
  };
}

test("AI monthly quota constants match Pro fair-usage specification", () => {
  assert.equal(PRO_AI_MONTHLY_LIMITS.cbt_generate, 25);
  assert.equal(PRO_AI_MONTHLY_LIMITS.assistant, 400);
  assert.equal(AI_QUOTA_BY_PLAN.basic.cbt_generate, 0);
  assert.equal(AI_QUOTA_BY_PLAN.basic.assistant, 0);
  assert.equal(AI_QUOTA_BY_PLAN.reguler.cbt_generate, 0);
  assert.equal(AI_QUOTA_BY_PLAN.reguler.assistant, 0);
  assert.equal(AI_QUOTA_BY_PLAN.pro.cbt_generate, 25);
  assert.equal(AI_QUOTA_BY_PLAN.pro.assistant, 400);
});

test("blocks Basic and Reguler tiers with 403 AI_PRO_REQUIRED", () => {
  const basicGate = evaluateAiQuotaGate(
    makeSummary({ plan: "basic", isPro: false, cbtGenerate: { limit: 0, used: 0, remaining: 0 } }),
    "cbt_generate",
    null,
  );
  assert.equal(basicGate.ok, false);
  if (basicGate.ok === false) {
    assert.equal(basicGate.status, 403);
    assert.equal(basicGate.code, "AI_PRO_REQUIRED");
  }

  const regulerGate = evaluateAiQuotaGate(
    makeSummary({ plan: "reguler", isPro: false, assistant: { limit: 0, used: 0, remaining: 0 } }),
    "assistant",
    "AIzaSySchoolOwnKeyShouldNotBypassTier",
  );
  assert.equal(regulerGate.ok, false);
  if (regulerGate.ok === false) {
    assert.equal(regulerGate.status, 403);
    assert.equal(regulerGate.code, "AI_PRO_REQUIRED");
  }
});

test("allows Pro tier under quota using vendor key", () => {
  const gate = evaluateAiQuotaGate(
    makeSummary({ cbtGenerate: { limit: 25, used: 24, remaining: 1 } }),
    "cbt_generate",
    "AIzaSyOptionalFallbackKey1234567890",
  );
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.mode, "vendor");
    assert.equal(gate.apiKeyOverride, undefined);
  }
});

test("returns 429 when Pro monthly quota exhausted and no school fallback key", () => {
  const gate = evaluateAiQuotaGate(
    makeSummary({ cbtGenerate: { limit: 25, used: 25, remaining: 0 } }),
    "cbt_generate",
    null,
  );
  assert.equal(gate.ok, false);
  if (gate.ok === false) {
    assert.equal(gate.status, 429);
    assert.equal(gate.code, "AI_QUOTA_EXCEEDED");
    assert.match(gate.error, /1 Desember 2026/);
    assert.match(gate.error, /top-up/i);
  }
});

test("falls back to optional school Gemini API key only when vendor quota is exhausted", () => {
  const gate = evaluateAiQuotaGate(
    makeSummary({
      hasFallbackKey: true,
      maskedFallbackKey: "AIzaSy••••7890",
      assistant: { limit: 400, used: 400, remaining: 0 },
    }),
    "assistant",
    "AIzaSySchoolFallbackKey1234567890",
  );
  assert.equal(gate.ok, true);
  if (gate.ok) {
    assert.equal(gate.mode, "school_fallback");
    assert.equal(gate.apiKeyOverride, "AIzaSySchoolFallbackKey1234567890");
  }
});

test("computes WIB month key, reset label, and masked API key accurately", () => {
  const decDate = new Date("2026-12-15T10:00:00.000Z");
  assert.equal(getCurrentQuotaMonthKey(decDate), "2026-12");
  assert.equal(getNextResetDateLabel(decDate), "1 Januari 2027");
  assert.equal(maskGeminiApiKey("AIzaSyAbcdef1234567890"), "AIzaSy••••7890");
  assert.equal(maskGeminiApiKey(""), null);
});
