import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { KopSurat } from "./KopSurat";
import { RegistrationReceipt, type RegistrationData } from "./RegistrationReceipt";
import { parseSchoolProfile, unwrapSchoolPayload, type SchoolProfile } from "./schoolProfile";
import { canAccessFeature, type PlanTier } from "../utils/planAccess";
import { resolvePlanSlug } from "./subscriptionPlans";
import { normalizeThemeKey, type ThemeKey } from "./TenantThemeProvider";

export const RESERVED_SLUGS = new Set(["login", "admin", "dashboard", "ppdb", "ujian", "api", "assets", "daftar", "register", "master", "sekolah", "lms", "www"]);
type PublicProfile = SchoolProfile & { themeKey: ThemeKey; planTier: PlanTier };
const slugValid = (slug: string) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);
function parsePublicProfile(data: unknown): PublicProfile | null {
  const record = unwrapSchoolPayload(data);
  if (!record) return null;
  const profile = parseSchoolProfile(record);
  if (!profile) return null;
  const rawPlan =
    typeof record.planTier === "string"
      ? record.planTier
      : typeof record.plan === "string"
        ? record.plan
        : typeof record.rawPlan === "string"
          ? record.rawPlan
          : typeof record.paket === "string"
            ? record.paket
            : null;
  return {
    ...profile,
    themeKey: normalizeThemeKey(record.themeKey, "ocean"),
    planTier: resolvePlanSlug(rawPlan),
  };
}
async function loadProfile(slug: string, signal: AbortSignal): Promise<PublicProfile> {
  if (!slugValid(slug)) throw new Error("Sekolah tidak ditemukan.");
  const response = await fetch(`/api/public/sekolah/${encodeURIComponent(slug)}`, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "Sekolah tidak ditemukan atau tidak aktif." : "Portal sekolah belum dapat dimuat.");
  const data: unknown = await response.json();
  const parsed = parsePublicProfile(data);
  if (!parsed) throw new Error("Respons profil sekolah tidak valid.");
  return parsed;
}
function whatsapp(phone: string | null, message: string): string | null {
  if (!phone) return null;
  let number = phone.replace(/[^0-9]/g, "");
  if (number.startsWith("0")) number = `62${number.slice(1)}`;
  if (!/^62\d{8,13}$/.test(number)) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

export function PortalLogin() {
  const [params, setParams] = useSearchParams();
  const slug = params.get("sekolah") || "";
  const [schoolSlug, setSchoolSlug] = useState(slug);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    setError("");
    loadProfile(slug, controller.signal).then(() => { window.location.replace(`https://${slug}.rsch.my.id/lms/login`); })
      .catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memilih sekolah:", failure); setError(failure instanceof Error ? failure.message : "Sekolah belum dapat dipilih."); } });
    return () => controller.abort();
  }, [slug, attempt]);
  function chooseSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = schoolSlug.trim().toLowerCase();
    if (!slugValid(value)) { setError("Alamat portal sekolah tidak valid."); return; }
    if (value === slug) setAttempt((previous) => previous + 1);
    else setParams({ sekolah: value });
  }
  return <main className="glass-shell flex min-h-screen items-center justify-center p-6"><div className="glass-panel w-full max-w-md rounded-3xl p-6">
    {slug && !error ? <p role="status">Mengalihkan ke login sekolah...</p> : <><h1 className="text-xl font-bold">Masuk Portal Belajar</h1><p className="mt-2 text-sm">Masukkan slug dari alamat portal sekolah Anda.</p><form onSubmit={chooseSchool} className="mt-4 space-y-3"><label className="block text-sm font-semibold">Slug sekolah<input className="glass-input mt-2 w-full rounded-xl px-4 py-3" value={schoolSlug} onChange={(event) => setSchoolSlug(event.target.value)} placeholder="Contoh: armilla" required /></label>{error && <p role="alert">{error}</p>}<button className="master-primary">Lanjutkan</button></form></>}
    <Link className="mt-4 inline-block underline" to="/">Kembali</Link>
  </div></main>;
}

export function PublicSchoolPortal({ slug: propSlug }: { slug?: string }) {
  const { slug: paramSlug = "" } = useParams();
  const host = window.location.hostname.toLowerCase();
  const base = ["pkbm.siput.id", "rsch.my.id"].find((d) => host.endsWith("." + d));
  const hostSlug = base ? host.slice(0, -(base.length + 1)) : "";
  const slug = propSlug || paramSlug || hostSlug;
  return <SchoolPortal key={slug} slug={slug} />;
}

function SchoolPortal({ slug }: { slug: string }) {
  const [school, setSchool] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<RegistrationData | null>(null);
  const [form, setForm] = useState({ nama: "", nik: "", nisn: "", tempatLahir: "", tanggalLahir: "", jenisKelamin: "", jenjang: "", telepon: "", asalSekolah: "" });
  useEffect(() => {
    const controller = new AbortController();
    setSchool(null); setReceipt(null); setError("");
    loadProfile(slug, controller.signal).then(setSchool).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat portal:", failure); setError(failure instanceof Error ? failure.message : "Portal belum dapat dimuat."); } });
    return () => controller.abort();
  }, [slug]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!form.nik.trim() && !form.nisn.trim()) { setError("Isi NIK atau NISN."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/public/sekolah/${encodeURIComponent(slug)}/ppdb`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : "Pendaftaran belum dapat dikirim.");
      if (typeof body !== "object" || body === null || !("noDaftar" in body) || typeof body.noDaftar !== "string") throw new Error("Respons tidak valid. Hubungi admin sebelum mengirim ulang.");
      setReceipt({ ...form, noDaftar: body.noDaftar });
    } catch (failure) { console.error("Gagal mengirim PPDB:", failure); setError(failure instanceof TypeError ? "Koneksi terputus. Hubungi admin sebelum mengirim ulang." : failure instanceof Error ? failure.message : "Pendaftaran belum dapat dikirim."); }
    finally { setBusy(false); }
  }
  if (!school) return <main className="glass-shell min-h-screen p-8">{error ? <p role="alert">{error}</p> : <p role="status">Memuat profil lembaga...</p>}</main>;
  const contact = whatsapp(school.teleponWa, receipt ? `Halo, saya ${receipt.nama}. Saya telah mendaftar di ${school.nama} dengan nomor ${receipt.noDaftar}.` : `Halo, saya ingin bertanya mengenai pendaftaran di ${school.nama}.`);
  const input = "glass-input mt-2 w-full rounded-xl px-4 py-3";
  return <div data-tenant-theme={school.themeKey}><main className="dashboard-canvas glass-area min-h-screen p-4 sm:p-8">
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="dashboard-glass rounded-3xl p-6"><div className="flex flex-wrap items-center gap-4">
        <div className="theme-brand flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-sky-600 text-2xl font-black text-white">{school.logoUrl ? <img src={school.logoUrl} alt={`Logo ${school.nama}`} className="h-full w-full object-contain" /> : school.nama.charAt(0).toUpperCase()}</div>
        <div className="min-w-0 flex-1"><h1 className="text-2xl font-black">{school.nama}</h1><p className="mt-1 text-sm">NPSN: {school.npsn || "Belum tersedia"}</p><p className="mt-1 text-sm">{[school.alamatLengkap, school.kabupatenKota, school.provinsi].filter(Boolean).join(", ") || "Alamat belum tersedia"}</p></div>
        <Link className="master-primary" to={`/login?sekolah=${encodeURIComponent(slug)}`}>Masuk Portal Belajar (Login)</Link>
      </div></header>
      {receipt ? <><RegistrationReceipt profile={school} applicant={receipt} /><div className="flex flex-wrap gap-3"><button type="button" className="master-primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>{contact ? <a className="master-outline" href={contact} target="_blank" rel="noopener noreferrer">Konfirmasi ke Admin PKBM via WhatsApp</a> : <p>Kontak WhatsApp lembaga belum tersedia. Simpan nomor registrasi Anda.</p>}</div></> :
      canAccessFeature(school.planTier, "reguler") ? <section className="dashboard-glass rounded-3xl p-5 sm:p-7"><div className="rounded-2xl bg-white p-4"><KopSurat profile={school} /></div><h2 className="mt-6 text-xl font-bold">Formulir Pendaftaran PPDB Online</h2><p className="mt-2 text-sm">Isi NIK atau NISN. Pendaftaran diperiksa oleh admin dan belum otomatis membuat akun.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
          {([["nama", "Nama lengkap", "text", 200], ["nik", "NIK (16 angka, jika ada)", "text", 16], ["nisn", "NISN (10 angka, jika ada)", "text", 10], ["tempatLahir", "Tempat lahir", "text", 200], ["tanggalLahir", "Tanggal lahir", "date", undefined], ["telepon", "Nomor WhatsApp", "tel", 30], ["asalSekolah", "Asal sekolah / putus sekolah", "text", 200]] as const).map(([key, label, type, max]) => <label key={key} className="text-sm font-semibold">{label}<input type={type} required={key !== "nik" && key !== "nisn"} maxLength={max} inputMode={key === "nik" || key === "nisn" ? "numeric" : undefined} pattern={key === "nik" ? "[0-9]{16}" : key === "nisn" ? "[0-9]{10}" : undefined} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className={input} /></label>)}
          <label className="text-sm font-semibold">Jenis kelamin<select required value={form.jenisKelamin} onChange={(event) => setForm({ ...form, jenisKelamin: event.target.value })} className={input}><option value="">Pilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
          <label className="text-sm font-semibold">Pilihan paket<select required value={form.jenjang} onChange={(event) => setForm({ ...form, jenjang: event.target.value })} className={input}><option value="">Pilih</option><option>Paket A</option><option>Paket B</option><option>Paket C</option></select></label>
          <button disabled={busy} className="master-primary sm:col-span-2 disabled:opacity-50">{busy ? "Mengirim..." : "Kirim Pendaftaran"}</button>
        </form></section> : <section className="dashboard-glass rounded-3xl p-6"><h2 className="text-xl font-bold">Informasi Pendaftaran</h2><p className="mt-3 text-sm">Pendaftaran online belum diaktifkan. Hubungi admin lembaga untuk informasi pendaftaran.</p>{contact ? <a className="master-primary mt-4" href={contact} target="_blank" rel="noopener noreferrer">Hubungi Admin via WhatsApp</a> : <p className="mt-3 text-sm">Kontak WhatsApp belum tersedia.</p>}</section>}
    </div>
  </main></div>;
}
