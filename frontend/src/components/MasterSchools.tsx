import { useEffect, useState } from "react";

type School = { id: string; nama: string; slug: string; npsn: string | null };
type SchoolPage = { sekolah: School[]; page: number; hasNext: boolean };

function isSchoolPage(data: unknown): data is SchoolPage {
  if (typeof data !== "object" || data === null || !("sekolah" in data) || !Array.isArray(data.sekolah) || !("page" in data) || typeof data.page !== "number" || !("hasNext" in data) || typeof data.hasNext !== "boolean") return false;
  return data.sekolah.every((school: unknown) => typeof school === "object" && school !== null &&
    "id" in school && typeof school.id === "string" &&
    "nama" in school && typeof school.nama === "string" &&
    "slug" in school && typeof school.slug === "string" &&
    "npsn" in school && (school.npsn === null || typeof school.npsn === "string"));
}

export function MasterSchools() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SchoolPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    fetch(`/api/master/sekolah?page=${page}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Daftar sekolah tidak tersedia. Coba lagi nanti.");
      const data: unknown = await response.json();
      if (!isSchoolPage(data) || data.page !== page) throw new Error("Respons daftar sekolah tidak valid.");
      setResult(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        console.error("Gagal memuat daftar sekolah:", error);
        setError(error instanceof Error ? error.message : "Daftar sekolah tidak tersedia.");
      }
    });
    return () => controller.abort();
  }, [page]);

  return <section className="mt-6 rounded-2xl border border-[#e6dfd0] bg-white p-6 shadow-sm">
    <h2 className="text-lg font-bold">Sekolah tercatat</h2>
    <p className="mt-2 text-sm text-slate-600">Daftar sekolah yang tersimpan di database. Pendaftaran dan pengelolaan sekolah masih disiapkan.</p>
    {error ? <p role="alert" className="mt-5 text-sm text-rose-700">{error}</p> : !result ? <p className="mt-5 text-sm text-slate-600">Memuat daftar sekolah...</p> : <>
      {result.sekolah.length === 0 ? <p className="mt-5 text-sm text-slate-600">Tidak ada sekolah pada halaman ini.</p> :
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead className="border-b border-[#e6dfd0] text-slate-600"><tr><th className="py-3 pr-4">Nama sekolah</th><th className="py-3 pr-4">Slug</th><th className="py-3">NPSN</th></tr></thead><tbody>{result.sekolah.map((school) => <tr key={school.id} className="border-b border-[#e6dfd0]"><td className="py-3 pr-4 font-semibold">{school.nama}</td><td className="py-3 pr-4">{school.slug}</td><td className="py-3">{school.npsn ?? "Belum diisi"}</td></tr>)}</tbody></table></div>}
      <div className="mt-5 flex items-center gap-4 text-sm"><button type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button type="button" disabled={!result.hasNext} onClick={() => setPage((value) => value + 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Berikutnya</button></div>
    </>}
  </section>;
}
