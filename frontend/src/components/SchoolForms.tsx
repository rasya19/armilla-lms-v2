import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

const fieldClass = "mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-normal";
const buttonClass = "rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

async function postJson(url: string, value: unknown): Promise<void> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  if (!response.ok) {
    let message = `Permintaan gagal (status ${response.status}).`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      const body: unknown = await response.json();
      if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") message = body.error;
    }
    throw new Error(message);
  }
}

export function TeacherForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ nama: "", nuptk: "", mapelUtama: "", email: "", telepon: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await postJson("/api/sekolah/guru", form);
      setForm({ nama: "", nuptk: "", mapelUtama: "", email: "", telepon: "" });
      setMessage("Data guru tersimpan. Akun guru belum dibuat.");
      onSaved();
    } catch (error) {
      console.error("Gagal menyimpan guru:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Periksa daftar guru sebelum mencoba lagi." : error instanceof Error ? error.message : "Gagal menyimpan guru.");
    } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-5 space-y-3 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5"><h3 className="font-bold">Tambah guru</h3>
    <label className="block text-sm font-semibold">Nama<input className={fieldClass} required minLength={2} maxLength={200} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></label>
    <label className="block text-sm font-semibold">NUPTK (opsional, 16 angka)<input className={fieldClass} inputMode="numeric" pattern="[0-9]{16}" maxLength={16} value={form.nuptk} onChange={(e) => setForm({ ...form, nuptk: e.target.value })} /></label>
    <label className="block text-sm font-semibold">Mata pelajaran utama<input className={fieldClass} required minLength={2} maxLength={100} value={form.mapelUtama} onChange={(e) => setForm({ ...form, mapelUtama: e.target.value })} /></label>
    <label className="block text-sm font-semibold">Email<input className={fieldClass} type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
    <label className="block text-sm font-semibold">Telepon<input className={fieldClass} type="tel" required minLength={6} maxLength={30} value={form.telepon} onChange={(e) => setForm({ ...form, telepon: e.target.value })} /></label>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}{message && <p role="status" className="text-sm text-green-700">{message}</p>}
    <button disabled={busy} className={buttonClass}>{busy ? "Menyimpan..." : "Simpan guru"}</button>
  </form>;
}

export function PublicPPDB() {
  const { slug = "" } = useParams();
  const [school, setSchool] = useState("");
  const [form, setForm] = useState({ nama: "", email: "", telepon: "", alamat: "", jenjang: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSchool(""); setError("");
    fetch(`/api/ppdb/${encodeURIComponent(slug)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "Sekolah tidak ditemukan." : "PPDB belum dapat dimuat.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("nama" in data) || typeof data.nama !== "string") throw new Error("Respons sekolah tidak valid.");
      setSchool(data.nama);
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error(error); setError(error instanceof Error ? error.message : "PPDB belum dapat dimuat."); } });
    return () => controller.abort();
  }, [slug]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await postJson(`/api/ppdb/${encodeURIComponent(slug)}`, form);
      setForm({ nama: "", email: "", telepon: "", alamat: "", jenjang: "" });
      setMessage("Pendaftaran disimpan dan menunggu pemeriksaan admin sekolah. Akun siswa belum tersedia.");
    } catch (error) {
      console.error("Gagal mengirim PPDB:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Hubungi admin sekolah sebelum mengirim ulang." : error instanceof Error ? error.message : "Pendaftaran gagal.");
    } finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f7f6f1] px-5 py-12 text-[#142137]"><div className="mx-auto max-w-xl rounded-3xl border border-[#e6dfd0] bg-white p-8"><h1 className="text-2xl font-bold">PPDB {school}</h1><p className="mt-3 text-sm text-slate-600">Hanya untuk pengujian lokal. Jangan masukkan data asli; akun siswa dan pemberitahuan belum tersedia.</p>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
    {school && !message && <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-sm font-semibold">Nama calon siswa<input className={fieldClass} required minLength={2} maxLength={200} value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Email<input className={fieldClass} type="email" required maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Telepon<input className={fieldClass} type="tel" required minLength={6} maxLength={30} value={form.telepon} onChange={(e) => setForm({ ...form, telepon: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Alamat<textarea className={fieldClass} required minLength={3} maxLength={500} value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></label>
      <label className="block text-sm font-semibold">Jenjang<input className={fieldClass} required minLength={2} maxLength={100} value={form.jenjang} onChange={(e) => setForm({ ...form, jenjang: e.target.value })} /></label>
      <button disabled={busy} className={buttonClass}>{busy ? "Mengirim..." : "Kirim pendaftaran"}</button>
    </form>}<Link className="mt-6 inline-block text-sm text-[#80643a] underline" to="/">Kembali ke beranda</Link></div></main>;
}

export function ReviewPPDB({ id, nama, onSaved }: { id: string; nama: string; onSaved: () => void }) {
  const [catatan, setCatatan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function review(keputusan: "Diterima" | "Ditolak") {
    if (keputusan === "Ditolak" && !catatan.trim()) { setError("Isi catatan penolakan."); return; }
    if (!window.confirm(`${keputusan === "Diterima" ? "Terima" : "Tolak"} pendaftaran ${nama}? Keputusan belum membuat akun siswa.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await postJson(`/api/sekolah/ppdb/${encodeURIComponent(id)}/tinjau`, { keputusan, catatan });
      setMessage("Keputusan disimpan. Data siswa dan akun belum dibuat."); onSaved();
    } catch (error) {
      console.error("Gagal meninjau PPDB:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Muat ulang daftar sebelum mencoba lagi." : error instanceof Error ? error.message : "Gagal menyimpan keputusan.");
    } finally { setBusy(false); }
  }
  return <div className="mt-3"><label className="block text-sm font-semibold">Catatan internal untuk {nama} (wajib saat menolak)<textarea className={fieldClass} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} /></label><div className="mt-2 flex gap-2"><button type="button" disabled={busy} onClick={() => review("Diterima")} className={buttonClass}>Terima</button><button type="button" disabled={busy} onClick={() => review("Ditolak")} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Tolak</button></div>{error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}{message && <p role="status" className="mt-2 text-sm text-green-700">{message}</p>}</div>;
}
