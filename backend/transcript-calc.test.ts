import { strict as assert } from "node:assert";
import { test } from "node:test";
import { computeTranscriptScore, isUpkExam } from "./transcript-calc.js";
import { parseTrialSignup } from "./trial-utils.js";

test("computes 60% 6-semester raport + 40% UPK transcript score accurately", () => {
  // 6 semesters: average = 85.00 -> 60% = 51.00; UPK = 90.00 -> 40% = 36.00; Total = 87.00 (B)
  const result = computeTranscriptScore([80, 82, 84, 86, 88, 90], 90);
  assert.equal(result.semesterCount, 6);
  assert.equal(result.rataRaport, 85);
  assert.equal(result.kontribusiRaport, 51);
  assert.equal(result.nilaiUpk, 90);
  assert.equal(result.kontribusiUpk, 36);
  assert.equal(result.nilaiTranskrip, 87);
  assert.equal(result.predikat, "B");

  // Caps at 6 semesters if more than 6 values provided
  const capped = computeTranscriptScore([90, 90, 90, 90, 90, 90, 10], 100);
  assert.equal(capped.semesterCount, 6);
  assert.equal(capped.rataRaport, 90);
  assert.equal(capped.nilaiTranskrip, 94);
  assert.equal(capped.predikat, "A");

  // Missing UPK returns null final transcript but keeps raport 60% preview
  const noUpk = computeTranscriptScore([80, 80], null);
  assert.equal(noUpk.rataRaport, 80);
  assert.equal(noUpk.kontribusiRaport, 48);
  assert.equal(noUpk.nilaiTranskrip, null);
  assert.equal(noUpk.predikat, "-");
});

test("detects UPK / Ujian Akhir exam codes and titles", () => {
  assert.equal(isUpkExam("UAK-AB12", "Matematika Kelas 12"), true);
  assert.equal(isUpkExam("UPK-2026", "Bahasa Indonesia"), true);
  assert.equal(isUpkExam("CBT-1234", "Ujian Akhir Pendidikan Kesetaraan Paket C"), true);
  assert.equal(isUpkExam("UTS-1234", "UTS Matematika"), false);
});

test("14-day free trial signup always unlocks full Pro plan regardless of requested tier", () => {
  const res = parseTrialSignup({
    namaSekolah: "PKBM Maju Bersama",
    slug: "maju-bersama",
    namaKontak: "Siti Aminah",
    emailKontak: "admin@majubersama.sch.id",
    teleponKontak: "081234567890",
    password: "password-aman",
    paket: "Basic",
  });
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.planSlug, "pro");
    assert.equal(res.data.paketLabel, "Pro");
  }
});
