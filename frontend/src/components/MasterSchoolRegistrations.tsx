import { useEffect, useState } from "react";

type Registration = {
  id: string;
  namaSekolah: string;
  npsn: string | null;
  namaKontak: string;
  emailKontak: string;
  teleponKontak: string;
  status: "MENUNGGU" | "DISETUJUI" | "DITOLAK";
  catatanTinjauan: string | null;
  sekolahId: string | null;
};
type RegistrationPage = { pendaftaran: Registration[]; page: number; hasNext: boolean };

function isRegistrationPage(data: unknown): data is RegistrationPage {
  if (typeof data !== "object" || data === null || !("pendaftaran" in data) || !Array.isArray(data.pendaftaran) || !("page" in data) || typeof data.page !== "number" || !("hasNext" in data) || typeof data.hasNext !== "boolean") return false;
  return data.pendaftaran.every((item: unknown) => {
    if (typeof item !== "object" || item === null) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.namaSekolah === "string" && (row.npsn === null || typeof row.npsn === "string") &&
      typeof row.namaKontak === "string" && typeof row.emailKontak === "string" && typeof row.teleponKontak === "string" &&
      (row.status === "MENUNGGU" || row.status === "DISETUJUI" || row.status === "DITOLAK") &&
      (row.catatanTinjauan === null || typeof row.catatanTinjauan === "string") &&
      (row.sekolahId === null || typeof row.sekolahId === "string");
  });
}

export function MasterSchoolRegistrations() {
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<RegistrationPage | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    fetch(`/api/master/pendaftaran-sekolah?page=${page}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Daftar pendaftaran tidak tersedia. Coba lagi nanti.");
      const data: unknown = await response.json();
      if (!isRegistrationPage(data) || data.page !== page) throw new Error("Respons daftar pendaftaran tidak valid.");
      setResult(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.error("Gagal memuat pendaftaran sekolah:", error);
        setError(error instanceof Error ? error.message : "Daftar pendaftaran tidak tersedia.");
      }
    });
    return () => controller.abort();
  }, [page, version]);

  async function review(item: Registration, keputusan: "DISETUJUI" | "DITOLAK") {
    const catatan = (notes[item.id] || "").trim();
    if (keputusan === "DITOLAK" && !catatan) {
      setError("Isi catatan sebelum menolak pendaftaran.");
      return;
    }
    setBusy(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/master/pendaftaran-sekolah/${encodeURIComponent(item.id)}/tinjau`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keputusan, catatan }),
      });
      if (!response.ok) {
        let detail = "Keputusan belum dapat disimpan. Coba lagi nanti.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") detail = data.error;
        }
        throw new Error(detail);
      }
      setMessage("Keputusan disimpan. Sekolah dan akun belum dibuat secara otomatis; undangan belum tersedia.");
      setVersion((value) => value + 1);
    } catch (error) {
      console.error("Gagal meninjau pendaftaran:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi. Pastikan backend berjalan." : error instanceof Error ? error.message : "Keputusan belum dapat disimpan.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteRegistration(item: Registration) {
    if (!window.confirm(`Hapus pendaftaran "${item.namaSekolah}" secara permanen? Data sekolah dan akun tidak akan dihapus.`)) return;
    setBusy(item.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/master/pendaftaran-sekolah/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!response.ok) {
        let detail = "Pendaftaran belum dapat dihapus. Coba lagi nanti.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") detail = data.error;
        }
        throw new Error(detail);
      }
      setMessage("Pendaftaran berhasil dihapus. Data sekolah dan akun tidak diubah.");
      if (page > 1 && result?.pendaftaran.length === 1) setPage((value) => value - 1);
      else setVersion((value) => value + 1);
    } catch (error) {
      console.error("Gagal menghapus pendaftaran:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi. Pastikan backend berjalan." : error instanceof Error ? error.message : "Pendaftaran belum dapat dihapus.");
    } finally {
      setBusy(null);
    }
  }

  return <section className="mt-6 rounded-2xl border border-[#e6dfd0] bg-white p-6 shadow-sm">
    <h2 className="text-lg font-bold">Pendaftaran sekolah</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Persetujuan hanya mencatat hasil pemeriksaan. Sekolah dan akun admin dapat dibuat terpisah melalui terminal untuk uji lokal; undangan belum dikirim.</p>
    {message && <p role="status" className="mt-4 text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    {!result && !error && <p className="mt-5 text-sm text-slate-600">Memuat daftar pendaftaran...</p>}
    {result && <>
      {result.pendaftaran.length === 0 && <p className="mt-5 text-sm text-slate-600">Tidak ada pendaftaran pada halaman ini.</p>}
      <div className="mt-5 space-y-4">{result.pendaftaran.map((item) => <article key={item.id} className="rounded-xl border border-[#e6dfd0] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold">{item.namaSekolah}</h3><span className="text-xs font-bold text-[#80643a]">{item.status === "MENUNGGU" ? "Menunggu" : item.status === "DISETUJUI" ? "Disetujui" : "Ditolak"}</span></div>
        <p className="mt-2 text-sm text-slate-600">NPSN: {item.npsn || "Belum diisi"}</p>
        <p className="mt-1 break-all text-sm text-slate-600">ID pendaftaran: {item.id}</p>
        {item.sekolahId && <p className="mt-1 text-sm text-slate-600">Sekolah dan akun admin sudah dibuat.</p>}
        <p className="mt-1 break-words text-sm text-slate-600">Kontak: {item.namaKontak} · {item.emailKontak} · {item.teleponKontak}</p>
        {item.catatanTinjauan && <p className="mt-2 break-words text-sm text-slate-600">Catatan: {item.catatanTinjauan}</p>}
        {item.status === "MENUNGGU" && <div className="mt-4">
          <label className="block text-sm font-semibold">Catatan internal untuk {item.namaSekolah} (wajib saat menolak; tidak dikirim ke sekolah)<textarea maxLength={500} value={notes[item.id] || ""} onChange={(event) => setNotes({ ...notes, [item.id]: event.target.value })} className="mt-2 block w-full rounded-xl border border-slate-300 p-3 font-normal" /></label>
          <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={busy !== null} onClick={() => review(item, "DISETUJUI")} className="rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Setujui pemeriksaan</button><button type="button" disabled={busy !== null} onClick={() => review(item, "DITOLAK")} className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Tolak</button></div>
        </div>}
        {!item.sekolahId && <button type="button" disabled={busy !== null} onClick={() => deleteRegistration(item)} aria-label={`Hapus pendaftaran ${item.namaSekolah}`} className="mt-4 rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">{busy === item.id ? "Memproses..." : "Hapus pendaftaran"}</button>}
      </article>)}</div>
      <div className="mt-5 flex items-center gap-4 text-sm"><button type="button" disabled={page === 1 || busy !== null} onClick={() => setPage((value) => value - 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!result.hasNext || busy !== null} onClick={() => setPage((value) => value + 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Berikutnya</button></div>
    </>}
  </section>;
}
