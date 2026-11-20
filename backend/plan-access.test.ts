import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canAccessPlan } from "./plan-access.js";

test("plan hierarchy denies invalid plans and permits only the required tier or higher", () => {
  for (const [plan, expected] of [
    ["basic", [true, false, false]],
    ["reguler", [true, true, false]],
    ["pro", [true, true, true]],
    ["invalid", [false, false, false]],
  ] as const) {
    assert.deepEqual((["basic", "reguler", "pro"] as const).map((required) => canAccessPlan(plan, required)), expected);
  }
});
