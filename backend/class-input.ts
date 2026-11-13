function object(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

export function parseClass(input: unknown) {
  const data = object(input);
  if (!data || typeof data.nama !== "string" || typeof data.waliGuruId !== "string") return null;
  const nama = data.nama.trim();
  const waliGuruId = data.waliGuruId.trim();
  if (nama.length < 1 || nama.length > 100 || !waliGuruId || waliGuruId.length > 100) return null;
  return { nama, waliGuruId };
}

export function parsePlacement(input: unknown): { kelasId: string | null; expectedKelasId: string | null } | null {
  const data = object(input);
  if (!data) return null;
  const validId = (id: unknown): id is string | null => id === null || (typeof id === "string" && id.length > 0 && id.length <= 100 && id === id.trim());
  if (!validId(data.kelasId) || !validId(data.expectedKelasId)) return null;
  return { kelasId: data.kelasId, expectedKelasId: data.expectedKelasId };
}
