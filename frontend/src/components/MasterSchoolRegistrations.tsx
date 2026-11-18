import { useEffect, useState } from "react";

type Registration = {
  id: string;
  namaSekolah: string;
  npsn: string | null;
  wilayah: string | null;
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
    return typeof row.id === "string" && typeof row.namaSekolah === "string" && (row.npsn === null || typeof row.npsn === "string") && (row.wilayah === null || typeof row.wilayah === "string") &&
      typeof row.namaKontak === "string" && typeof row.emailKontak === "string" && typeof row.teleponKontak === "string" &&
      (row.status === "MENUNGGU" || row.status === "DISETUJUI" || row.status === "DITOLAK") &&
      (row.catatanTinjauan === null || typeof row.catatanTinjauan === "string") &&
      (row.sekolahId === null || typeof row.sekolahId === "string");
  });
}

export function MasterSchoolRegistrations() {
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<RegistrationPage | null>(null);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
  }, [page, refreshKey]);

  async function deleteRegistration(item: Registration) {
    const warning = item.sekolahId
      ? "Sekolah dan semua akun adminnya di LMS juga akan dihapus permanen. Sekolah yang memiliki data terkait tidak dapat dihapus. Data di Rasyatech Admin tidak ikut dihapus."
      : "Pendaftaran akan dihapus permanen dari LMS. Data di Rasyatech Admin tidak ikut dihapus.";
    if (!window.confirm(`Hapus pendaftaran ${item.namaSekolah} (NPSN ${item.npsn || "belum diisi"})? ${warning}`)) return;
    setDeletingId(item.id);
    setDeleteError("");
    try {
      const response = await fetch(`/api/master/pendaftaran-sekolah/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : response.status === 404 ? "Pendaftaran tidak ditemukan. Muat ulang daftar." : response.status === 409 ? "Sekolah memiliki data terkait dan tidak dapat dihapus melalui menu ini." : "Pendaftaran belum dapat dihapus. Coba lagi nanti.");
      }
      if (result?.pendaftaran.length === 1 && page > 1) setPage((value) => value - 1);
      else setRefreshKey((value) => value + 1);
    } catch (error) {
      console.error("Gagal menghapus pendaftaran sekolah:", error);
      setDeleteError(error instanceof Error ? error.message : "Pendaftaran belum dapat dihapus.");
    } finally {
      setDeletingId(null);
    }
  }

  return <section className="master-section p-6 text-slate-900">
    <h2 className="text-lg font-bold">Pendaftaran sekolah</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Pendaftaran diteruskan ke Rasyatech Admin. Verifikasi dan aktivasi dilakukan di sana; status di LMS berubah setelah provisioning berhasil.</p>
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    {deleteError && <p role="alert" className="mt-4 text-sm text-rose-700">{deleteError}</p>}
    {!result && !error && <p className="mt-5 text-sm text-slate-600">Memuat daftar pendaftaran...</p>}
    {result && <>
      {result.pendaftaran.length === 0 && <p className="mt-5 text-sm text-slate-600">Tidak ada pendaftaran pada halaman ini.</p>}
      <div className="mt-5 space-y-4">{result.pendaftaran.map((item) => <article key={item.id} className="master-record p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-bold">{item.namaSekolah}</h3><div className="flex items-center gap-4"><span className="text-xs font-bold text-[#80643a]">{item.status === "MENUNGGU" ? "Menunggu" : item.status === "DISETUJUI" ? "Disetujui" : "Ditolak"}</span><button type="button" disabled={deletingId !== null} onClick={() => void deleteRegistration(item)} className="text-xs font-bold text-rose-700 disabled:text-slate-400">{deletingId === item.id ? "Menghapus..." : "Hapus"}</button></div></div>
        <p className="mt-2 text-sm text-slate-600">NPSN: {item.npsn || "Belum diisi"}</p>
        <p className="mt-1 text-sm text-slate-600">Wilayah: {item.wilayah || "Belum diisi"}</p>
        <p className="mt-1 break-all text-sm text-slate-600">ID pendaftaran: {item.id}</p>
        {item.sekolahId && <p className="mt-1 text-sm text-slate-600">Sekolah dan akun admin sudah dibuat.</p>}
        <p className="mt-1 break-words text-sm text-slate-600">Kontak: {item.namaKontak} · {item.emailKontak} · {item.teleponKontak}</p>
        {item.catatanTinjauan && <p className="mt-2 break-words text-sm text-slate-600">Catatan: {item.catatanTinjauan}</p>}
      </article>)}</div>
      <div className="mt-5 flex items-center gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!result.hasNext} onClick={() => setPage((value) => value + 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Berikutnya</button></div>
    </>}
  </section>;
}
