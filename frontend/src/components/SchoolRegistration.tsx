import { useState } from "react";
import { Link } from "react-router-dom";

const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[#142137]";

export function SchoolRegistration() {
  const [form, setForm] = useState({ namaSekolah: "", npsn: "", namaKontak: "", emailKontak: "", teleponKontak: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pendaftaran-sekolah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        let detail = "Pendaftaran belum dapat disimpan. Pastikan server berjalan dan coba lagi.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
            detail = data.error;
            if ("code" in data && typeof data.code === "string" && /^REGISTRATION_[A-Z_]+$/.test(data.code)) detail += ` (${data.code})`;
            if ("reference" in data && typeof data.reference === "string" && /^[a-f0-9-]{36}$/.test(data.reference)) detail += ` Referensi: ${data.reference}`;
          }
        }
        throw new Error(detail);
      }
      setMessage("Pendaftaran diterima dan menunggu pemeriksaan master admin. Undangan dan akun admin sekolah belum tersedia.");
      setForm({ namaSekolah: "", npsn: "", namaKontak: "", emailKontak: "", teleponKontak: "" });
    } catch (error) {
      console.error("Gagal mengirim pendaftaran sekolah:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi. Pastikan backend berjalan." : error instanceof Error ? error.message : "Pendaftaran belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-[#f7f6f1] px-5 py-12 text-[#142137]"><div className="mx-auto max-w-xl rounded-3xl border border-[#e6dfd0] bg-white p-6 shadow-sm sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-[#80643a]">Rasyatech Digital Zenith</p>
    <h1 className="mt-3 text-3xl font-bold">Pendaftaran sekolah</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Pendaftaran sedang diuji secara lokal. Persetujuan belum membuat akun sekolah atau mengirim undangan; jangan kirim data sungguhan dulu.</p>
    {message ? <div role="status" className="mt-6 rounded-xl bg-[#f8f6ef] p-5 text-sm leading-6">{message}</div> :
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">Nama sekolah<input className={inputClass} required minLength={2} maxLength={200} value={form.namaSekolah} onChange={(e) => setForm({ ...form, namaSekolah: e.target.value })} /></label>
        <label className="block text-sm font-semibold">NPSN (opsional)<input className={inputClass} autoCapitalize="characters" pattern="([0-9]{8}|[PpKk][0-9]{7})" title="Masukkan 8 angka atau huruf P/K diikuti 7 angka." aria-describedby="npsn-help" maxLength={8} value={form.npsn} onChange={(e) => setForm({ ...form, npsn: e.target.value.toUpperCase() })} /><span id="npsn-help" className="mt-2 block text-xs font-normal text-slate-600">8 angka, atau huruf P/K diikuti 7 angka. Kosongkan jika belum memiliki NPSN.</span></label>
        <label className="block text-sm font-semibold">Nama penanggung jawab<input className={inputClass} required minLength={2} maxLength={120} value={form.namaKontak} onChange={(e) => setForm({ ...form, namaKontak: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Email penanggung jawab<input className={inputClass} type="email" required maxLength={254} value={form.emailKontak} onChange={(e) => setForm({ ...form, emailKontak: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Nomor telepon<input className={inputClass} type="tel" required minLength={6} maxLength={30} value={form.teleponKontak} onChange={(e) => setForm({ ...form, teleponKontak: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-[#0c192d] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Mengirim..." : "Kirim pendaftaran"}</button>
      </form>}
    <Link to="/" className="mt-6 inline-block text-sm font-semibold text-[#80643a] underline">Kembali ke beranda</Link>
  </div></main>;
}
