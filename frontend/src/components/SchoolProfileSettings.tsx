import { useEffect, useRef, useState } from "react";
import { KopSurat } from "./KopSurat";
import { parseSchoolProfile, type SchoolProfile } from "./schoolProfile";

const fields: { key: Exclude<keyof SchoolProfile, "logoUrl">; label: string; type?: string; max: number }[] = [
  { key: "namaYayasan", label: "Nama yayasan", max: 200 },
  { key: "nama", label: "Nama PKBM", max: 200 },
  { key: "npsn", label: "NPSN", max: 8 },
  { key: "skIzinOperasional", label: "Nomor SK izin operasional", max: 200 },
  { key: "alamatLengkap", label: "Alamat lengkap", max: 500 },
  { key: "kabupatenKota", label: "Kabupaten / kota", max: 200 },
  { key: "provinsi", label: "Provinsi", max: 200 },
  { key: "teleponWa", label: "Telepon / WhatsApp", type: "tel", max: 30 },
  { key: "emailSekolah", label: "Email sekolah", type: "email", max: 254 },
  { key: "websiteSekolah", label: "Website sekolah (HTTPS)", type: "url", max: 500 },
  { key: "namaKetuaPkbm", label: "Nama ketua PKBM", max: 200 },
];

export function SchoolProfileSettings() {
  const [profile, setProfile] = useState<SchoolProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const logoSequence = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sekolah/profil", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Profil belum dapat dimuat.");
      const body: unknown = await response.json();
      const parsed = parseSchoolProfile(body);
      if (!parsed) throw new Error("Respons profil tidak valid.");
      setProfile(parsed);
    }).catch((failure: unknown) => { if (!controller.signal.aborted) { console.error("Gagal memuat profil:", failure); setError(failure instanceof Error ? failure.message : "Profil belum dapat dimuat."); } });
    return () => controller.abort();
  }, []);

  function readLogo(file: File | undefined) {
    const sequence = ++logoSequence.current;
    if (!file) { setLogoLoading(false); return; }
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 204800) {
      setLogoLoading(false); setError("Logo harus PNG/JPG dengan ukuran maksimal 200 KB."); return;
    }
    setError(""); setLogoLoading(true);
    const reader = new FileReader();
    reader.onload = () => {
      if (sequence !== logoSequence.current) return;
      setLogoLoading(false);
      if (typeof reader.result !== "string") { setError("Logo belum dapat dibaca."); return; }
      const logoUrl = reader.result;
      setProfile((current) => current && { ...current, logoUrl });
    };
    reader.onerror = () => { if (sequence === logoSequence.current) { setLogoLoading(false); setError("Logo belum dapat dibaca."); } };
    reader.readAsDataURL(file);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || busy || logoLoading) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/sekolah/profil", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(typeof data === "object" && data !== null && "error" in data && typeof data.error === "string" ? data.error : "Profil belum dapat disimpan.");
      const parsed = parseSchoolProfile(data);
      if (!parsed) throw new Error("Respons profil tidak valid. Muat ulang untuk memeriksa hasil.");
      setProfile(parsed); setNotice("Profil lembaga berhasil disimpan.");
    } catch (failure) { console.error("Gagal menyimpan profil:", failure); setError(failure instanceof TypeError ? "Koneksi terputus. Muat ulang untuk memeriksa hasil." : failure instanceof Error ? failure.message : "Profil belum dapat disimpan."); }
    finally { setBusy(false); }
  }
  return <section className="dashboard-glass space-y-5 rounded-3xl p-5 sm:p-7">
    <h2 className="text-xl font-bold">Profil Lembaga &amp; Kop Surat</h2>
    <p className="text-sm">Data profil dan logo akan ditampilkan secara publik pada portal sekolah.</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {profile && <><div className="rounded-2xl bg-white p-4"><p className="mb-3 text-xs font-bold uppercase text-slate-600">Pratinjau kop surat</p><KopSurat profile={profile} /></div>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {fields.map(({ key, label, type, max }) => <label key={key} className="text-sm font-semibold">{label}<input required={key === "nama"} type={type || "text"} maxLength={max} value={profile[key] ?? ""} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} className="glass-input mt-2 w-full rounded-xl px-4 py-3" /></label>)}
        <div className="sm:col-span-2"><label className="block text-sm font-semibold">Upload logo PKBM (PNG/JPG, maksimal 200 KB)<input type="file" accept="image/png,image/jpeg" onChange={(event) => readLogo(event.target.files?.[0])} className="glass-input mt-2 w-full rounded-xl px-4 py-3" /></label>{profile.logoUrl && <button type="button" className="mt-2 text-sm font-bold underline" onClick={() => { logoSequence.current++; setLogoLoading(false); setProfile({ ...profile, logoUrl: null }); }}>Hapus logo</button>}</div>
        <button type="submit" disabled={busy || logoLoading} className="master-primary sm:col-span-2 disabled:opacity-50">{busy ? "Menyimpan..." : logoLoading ? "Membaca logo..." : "Simpan Profil"}</button>
      </form></>}
  </section>;
}
