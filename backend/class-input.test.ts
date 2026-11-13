import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseClass, parsePlacement } from "./class-input.js";

test("class input requires a name and a homeroom teacher", () => {
  assert.deepEqual(parseClass({ nama: "  7 A ", waliGuruId: " guru-id " }), { nama: "7 A", waliGuruId: "guru-id" });
  for (const data of [null, [], {}, { nama: " ", waliGuruId: "g" }, { nama: "x".repeat(101), waliGuruId: "g" }, { nama: "7 A", waliGuruId: "" }]) {
    assert.equal(parseClass(data), null);
  }
});

test("placement accepts a class id or an explicit removal", () => {
  assert.deepEqual(parsePlacement({ kelasId: "class-id", expectedKelasId: null }), { kelasId: "class-id", expectedKelasId: null });
  assert.deepEqual(parsePlacement({ kelasId: null, expectedKelasId: "class-id" }), { kelasId: null, expectedKelasId: "class-id" });
  for (const data of [null, [], {}, { kelasId: null }, { kelasId: "", expectedKelasId: null }, { kelasId: 123, expectedKelasId: null }, { kelasId: "x".repeat(101), expectedKelasId: null }]) assert.equal(parsePlacement(data), null);
});
