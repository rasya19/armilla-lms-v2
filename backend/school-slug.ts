export function schoolSlugBase(name: string): string {
  const slug = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 55);
  return !slug || slug === "www" ? "sekolah" : slug;
}
