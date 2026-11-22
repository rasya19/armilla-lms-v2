type Choice = "A" | "B" | "C" | "D";
export type ExamQuestion = { teks: string; opsi: string[]; benar: Choice };
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function choice(value: unknown): value is Choice { return value === "A" || value === "B" || value === "C" || value === "D"; }
export function examInput(value: unknown) {
  if (!object(value) || typeof value.jadwalId !== "string" || !value.jadwalId || typeof value.judul !== "string" || !value.judul.trim() || value.judul.trim().length > 200 ||
      typeof value.mulai !== "string" || typeof value.selesai !== "string" || typeof value.durasiMenit !== "number" || !Number.isInteger(value.durasiMenit) || value.durasiMenit < 1 || value.durasiMenit > 480 ||
      !Array.isArray(value.soal) || value.soal.length < 1 || value.soal.length > 100) return null;
  const mulai = new Date(value.mulai), selesai = new Date(value.selesai);
  if (Number.isNaN(mulai.getTime()) || Number.isNaN(selesai.getTime()) || mulai >= selesai) return null;
  const soal: ExamQuestion[] = [];
  for (const question of value.soal) {
    if (!object(question) || typeof question.teks !== "string" || !question.teks.trim() || question.teks.length > 5000 || !Array.isArray(question.opsi) || question.opsi.length !== 4 || !question.opsi.every((item: unknown) => typeof item === "string" && item.trim().length > 0 && item.length <= 2000) || !choice(question.benar)) return null;
    soal.push({ teks: question.teks.trim(), opsi: question.opsi.map((item: string) => item.trim()), benar: question.benar });
  }
  return { jadwalId: value.jadwalId, judul: value.judul.trim(), mulai, selesai, durasiMenit: value.durasiMenit, soal };
}
type AnswerChoice = "A" | "B" | "C" | "D" | "E";
export function answerChoice(value: unknown): value is AnswerChoice { return value === "A" || value === "B" || value === "C" || value === "D" || value === "E"; }
export function answersInput(value: unknown): Record<string, AnswerChoice | null> | null {
  if (!object(value) || Object.keys(value).length > 100) return null;
  const answers: Record<string, AnswerChoice | null> = {};
  for (const [id, answer] of Object.entries(value)) {
    if (!id || id.length > 100) return null;
    if (answer === null) answers[id] = null;
    else if (answerChoice(answer)) answers[id] = answer;
    else return null;
  }
  return answers;
}
