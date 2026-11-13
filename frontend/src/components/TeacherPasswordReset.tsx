import { useState } from "react";

type Student = { id: string; nama: string; nisn: string };

async function responseError(response: Response): Promise<string> {
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  }
  return `Permintaan gagal (status ${response.status}).`;
}

export function TeacherPasswordReset() {
  const [nisn, setNisn] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (temporaryPassword) return;
    setBusy(true); setError(""); setMessage(""); setStudent(null);
    try {
      const response = await fetch(`/api/lms/guru/siswa-reset?nisn=${encodeURIComponent(nisn)}`);
      if (!response.ok) throw new Error(await responseError(response));
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("id" in body) || typeof body.id !== "string" || !("nama" in body) || typeof body.nama !== "string" || !("nisn" in body) || typeof body.nisn !== "string") throw new Error("Respons pencarian tidak valid.");
      setStudent({ id: body.id, nama: body.nama, nisn: body.nisn });
    } catch (error) {
      console.error("Gagal mencari siswa:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi." : error instanceof Error ? error.message : "Pencarian gagal.");
    } finally { setBusy(false); }
  }

  async function reset() {
    if (!student || temporaryPassword || !window.confirm(`Reset password ${student.nama} (NISN ${student.nisn}) dengan password sementara unik? Semua sesi siswa akan berakhir.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/lms/guru/siswa/${encodeURIComponent(student.id)}/reset-password`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("temporaryPassword" in body) || typeof body.temporaryPassword !== "string" || !/^[A-Za-z0-9_-]{24}$/.test(body.temporaryPassword)) throw new Error("Respons tidak valid. Reset kembali untuk memperoleh password baru.");
      setTemporaryPassword(body.temporaryPassword);
      setMessage(`Password sementara untuk ${student.nama}:`);
      setStudent(null);
    } catch (error) {
      console.error("Gagal mereset password:", error);
      setError(error instanceof TypeError ? "Koneksi terputus. Hasil reset belum diketahui; reset kembali untuk memperoleh password baru." : error instanceof Error ? error.message : "Reset gagal.");
    } finally { setBusy(false); }
  }

  return <section className="mt-6 rounded-xl border border-[#e6dfd0] bg-[#f8f6ef] p-5">
    <h2 className="font-bold">Reset password siswa</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Uji lokal saja. Hanya siswa aktif yang memiliki akun dan berada di kelas yang Anda ajar pada tahun ajaran aktif yang dapat direset.</p>
    <form onSubmit={search} className="mt-4"><label className="block text-sm font-semibold">NISN siswa<input disabled={!!temporaryPassword} className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} required value={nisn} onChange={(e) => { setNisn(e.target.value); setStudent(null); setMessage(""); }} /></label><button disabled={busy || !!temporaryPassword} className="mt-3 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Cari siswa</button></form>
    {student && <div className="mt-4 rounded-xl border border-[#e6dfd0] bg-white p-4"><p className="font-bold">{student.nama}</p><p className="mt-1 text-sm">NISN: {student.nisn}</p><button disabled={busy || !!temporaryPassword} type="button" onClick={reset} className="mt-3 rounded-xl border border-rose-300 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Reset password</button></div>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {temporaryPassword && <div role="status" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p className="font-bold">{message}</p><p className="mt-2 break-all font-mono">{temporaryPassword}</p><p className="mt-2">Hanya ditampilkan sekarang. Sampaikan langsung kepada siswa dengan cara yang aman. Siswa wajib menggantinya saat masuk; jika hilang, reset kembali.</p><button type="button" onClick={() => { setTemporaryPassword(""); setMessage(""); }} className="mt-3 font-bold underline">Saya sudah menyimpan dengan aman</button></div>}
  </section>;
}
