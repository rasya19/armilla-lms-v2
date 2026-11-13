import { useEffect, useState } from "react";
import { StudentImport } from "./StudentImport";
import { ReviewPPDB, TeacherForm } from "./SchoolForms";
import { SchoolClasses } from "./SchoolClasses";
import { SchoolAcademics } from "./SchoolAcademics";

type Row = { id: string; nama: string; keterangan: string; status: string; punyaAkun?: boolean; email?: string; telepon?: string; alamat?: string; jenjang?: string; catatan?: string | null };
type Result = { rows: Row[]; page: number; hasNext: boolean };
type Kind = "siswa" | "guru" | "ppdb" | "kelas" | "akademik";
const labels: Record<Kind, string> = { siswa: "Data Siswa", guru: "Data Guru", kelas: "Kelas", akademik: "Tahun & Jadwal", ppdb: "PPDB" };

function isResult(data: unknown): data is Result {
  if (typeof data !== "object" || data === null || !("rows" in data) || !Array.isArray(data.rows) || !("page" in data) || typeof data.page !== "number" || !("hasNext" in data) || typeof data.hasNext !== "boolean") return false;
  return data.rows.every((row: unknown) => typeof row === "object" && row !== null && "id" in row && typeof row.id === "string" && "nama" in row && typeof row.nama === "string" && "keterangan" in row && typeof row.keterangan === "string" && "status" in row && typeof row.status === "string");
}

export function SchoolData({ slug }: { slug: string }) {
  const [kind, setKind] = useState<Kind>("siswa");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [accountBusy, setAccountBusy] = useState(false);
  const [credential, setCredential] = useState<{ nama: string; password: string } | null>(null);
  const [accountError, setAccountError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (kind === "kelas" || kind === "akademik") return () => controller.abort();
    fetch(`/api/sekolah/${kind}?page=${page}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(response.status === 401 ? "Sesi berakhir. Silakan masuk kembali." : "Data belum dapat dimuat.");
      const body: unknown = await response.json();
      if (!isResult(body) || body.page !== page) throw new Error("Respons data sekolah tidak valid.");
      setData(body);
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error(error); setError(error instanceof Error ? error.message : "Data belum dapat dimuat."); } });
    return () => controller.abort();
  }, [kind, page, version]);
  async function manageAccount(row: Row, role: "siswa" | "guru", reset: boolean) {
    if (credential || !window.confirm(reset ? `Reset password akun ${row.nama}? Semua sesi akun akan berakhir.` : `Buat akun ${role} untuk ${row.nama} dengan password sementara unik?`)) return;
    setAccountBusy(true); setAccountError("");
    try {
      const response = await fetch(`/api/sekolah/${role}/${encodeURIComponent(row.id)}/${reset ? "reset-password" : "akun"}`, { method: "POST" });
      if (!response.ok) {
        let message = "Akun belum dapat dibuat.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("temporaryPassword" in body) || typeof body.temporaryPassword !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(body.temporaryPassword)) throw new Error("Respons tidak valid. Muat ulang daftar dan reset password untuk memperoleh password baru.");
      setCredential({ nama: row.nama, password: body.temporaryPassword });
      setVersion((value) => value + 1);
    } catch (error) {
      console.error("Gagal membuat akun:", error);
      setAccountError(error instanceof TypeError ? "Koneksi terputus. Muat ulang daftar; jika akun sudah ada, reset password untuk memperoleh password baru." : error instanceof Error ? error.message : "Akun belum dapat diproses.");
    } finally { setAccountBusy(false); }
  }
  return <section className="mt-8 rounded-xl border border-[#e6dfd0] bg-white p-6">
    <nav aria-label="Menu sekolah" className="flex flex-wrap gap-2">{(Object.keys(labels) as Kind[]).map((item) => <button key={item} type="button" aria-current={kind === item ? "page" : undefined} onClick={() => { setKind(item); setPage(1); }} className={`rounded-xl px-4 py-2 text-sm font-bold ${kind === item ? "bg-[#0c192d] text-white" : "bg-[#f7f6f1] text-[#142137]"}`}>{labels[item]}</button>)}</nav>
    <h2 className="mt-6 text-lg font-bold">{labels[kind]}</h2><p className="mt-2 text-sm text-slate-600">Data dibatasi untuk sekolah ini dan hanya untuk pengujian lokal.</p>
    {accountError && <p role="alert" className="mt-4 text-sm text-rose-700">{accountError}</p>}
    {credential && <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p className="font-bold">Password sementara untuk {credential.nama}</p><p className="mt-2 break-all font-mono">{credential.password}</p><p className="mt-2">Hanya ditampilkan sekarang. Sampaikan langsung melalui cara yang aman; pengguna wajib menggantinya saat masuk. Jika hilang, reset kembali.</p><button type="button" onClick={() => setCredential(null)} className="mt-3 font-bold underline">Saya sudah menyimpan dengan aman</button></div>}
    {kind === "kelas" ? <SchoolClasses /> : kind === "akademik" ? <SchoolAcademics /> : <>
    {kind === "siswa" && <StudentImport onImported={() => setVersion((value) => value + 1)} />}
    {kind === "guru" && <TeacherForm onSaved={() => setVersion((value) => value + 1)} />}
    {kind === "ppdb" && <div className="mt-4 rounded-xl bg-[#f8f6ef] p-4 text-sm"><p>Tautan PPDB uji lokal:</p><a className="break-all font-semibold text-[#80643a] underline" href={`/ppdb/${encodeURIComponent(slug)}`}>{`${window.location.origin}/ppdb/${encodeURIComponent(slug)}`}</a><p className="mt-2">Penerimaan hanya mencatat keputusan; akun dan data siswa belum dibuat. Tautan localhost tidak dapat digunakan oleh sekolah lain di internet.</p></div>}
    {error ? <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p> : !data ? <p className="mt-4 text-sm">Memuat data...</p> : <>
      {data.rows.length === 0 ? <p className="mt-4 text-sm text-slate-600">Belum ada data pada halaman ini.</p> : kind === "ppdb" ? <div className="mt-4 space-y-3">{data.rows.map((row) => <article key={row.id} className="rounded-xl border border-[#e6dfd0] p-4"><h3 className="font-bold">{row.nama}</h3><p className="mt-2 break-all text-sm">No. {row.keterangan} · {row.status}</p><p className="mt-1 break-words text-sm text-slate-600">Email: {row.email} · Telepon: {row.telepon}</p><p className="mt-1 break-words text-sm text-slate-600">Jenjang: {row.jenjang} · Alamat: {row.alamat}</p>{row.catatan && <p className="mt-1 break-words text-sm">Catatan: {row.catatan}</p>}{row.status === "Pending" && <ReviewPPDB id={row.id} nama={row.nama} onSaved={() => setVersion((value) => value + 1)} />}</article>)}</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[36rem] text-left text-sm"><thead><tr><th className="p-2">Nama</th><th className="p-2">{kind === "siswa" ? "NISN" : "NUPTK / Email"}</th><th className="p-2">Status</th><th className="p-2">Akun LMS</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-[#e6dfd0]"><td className="p-2">{row.nama}</td><td className="p-2">{row.keterangan}{kind === "guru" && <p>{row.email}</p>}</td><td className="p-2">{row.status}</td><td className="p-2">{row.status !== "Aktif" ? "Data tidak aktif" : <button disabled={accountBusy || !!credential} type="button" onClick={() => manageAccount(row, kind, !!row.punyaAkun)} className="font-bold text-[#80643a] underline disabled:opacity-50">{row.punyaAkun ? "Reset password" : "Buat akun"}</button>}</td></tr>)}</tbody></table></div>}
      <div className="mt-5 flex items-center gap-4 text-sm"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Sebelumnya</button><span>Halaman {page}</span><button disabled={!data.hasNext} onClick={() => setPage((value) => value + 1)} className="font-bold text-[#80643a] disabled:text-slate-400">Berikutnya</button></div>
    </>}
    </>}
  </section>;
}
