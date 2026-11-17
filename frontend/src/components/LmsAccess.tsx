import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { LmsSchedule } from "./LmsSchedule";
import { LmsLearning } from "./LmsLearning";
import { PasswordChangeForm } from "./PasswordChangeForm";

type Session = { nama: string; peran: "SISWA" | "GURU"; wajibGantiPassword: boolean };
const input = "glass-input mt-2 w-full rounded-xl px-4 py-3";
const button = "master-primary w-full py-3 disabled:opacity-50";

async function post(url: string, body?: object) {
  const response = await fetch(url, { method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    let message = `Permintaan gagal (status ${response.status}).`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") message = data.error;
    }
    throw new Error(message);
  }
}

export function LmsLogin() {
  const [peran, setPeran] = useState<"SISWA" | "GURU">("SISWA");
  const [identitas, setIdentitas] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await post("/api/auth/lms/login", { peran, identitas, password }); setPassword(""); navigate("/lms"); }
    catch (error) { console.error("Login LMS gagal:", error); setError(error instanceof TypeError ? "Server tidak dapat dihubungi." : error instanceof Error ? error.message : "Login gagal."); }
    finally { setBusy(false); }
  }
  return <main className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <p className="master-eyebrow">KESETARAAN LMS / PEMBELAJARAN</p><h1 className="mt-3 text-2xl font-bold">Login Guru dan Siswa</h1><p className="mt-3 text-sm text-slate-700">Akun LMS untuk pengujian lokal, dibuat oleh admin sekolah.</p>
    {location.state?.changed === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-semibold">Peran<select className={input} value={peran} onChange={(e) => { setPeran(e.target.value === "GURU" ? "GURU" : "SISWA"); setIdentitas(""); }}><option value="SISWA">Siswa</option><option value="GURU">Guru</option></select></label>
      <label className="block text-sm font-semibold">{peran === "SISWA" ? "NISN" : "Email"}<input className={input} required maxLength={254} autoComplete="username" value={identitas} onChange={(e) => setIdentitas(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Kata sandi<input className={input} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className={button}>{busy ? "Memeriksa..." : "Masuk"}</button>
    </form><Link className="mt-6 inline-block text-sm font-semibold text-indigo-800 underline" to="/login">Login admin sekolah</Link>
  </div></main>;
}

export function LmsHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/lms/session", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setStatus("unauthorized"); return; }
      if (!response.ok) throw new Error("Sesi LMS tidak tersedia.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("nama" in data) || typeof data.nama !== "string" || !("peran" in data) || (data.peran !== "SISWA" && data.peran !== "GURU") || !("wajibGantiPassword" in data) || typeof data.wajibGantiPassword !== "boolean") throw new Error("Respons sesi tidak valid.");
      setSession({ nama: data.nama, peran: data.peran, wajibGantiPassword: data.wajibGantiPassword }); setStatus("ready");
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error(error); setStatus("error"); } });
    return () => controller.abort();
  }, []);
  async function logout() {
    setBusy(true); setError("");
    try { await post("/api/auth/lms/logout"); navigate("/lms/login", { replace: true }); }
    catch (error) { console.error("Gagal keluar:", error); setError("Gagal keluar. Coba lagi."); }
    finally { setBusy(false); }
  }
  if (status === "unauthorized") return <Navigate to="/lms/login" replace />;
  if (status !== "ready" || !session) return <main className="p-8">{status === "loading" ? "Memeriksa sesi..." : "Layanan sesi tidak tersedia. Muat ulang halaman."}</main>;
  return <main className="glass-shell glass-area min-h-screen px-5 py-12"><div className="glass-panel mx-auto max-w-xl rounded-3xl p-6 sm:p-8">
    <h1 className="text-2xl font-bold">{session.wajibGantiPassword ? "Wajib ganti password" : `Selamat datang, ${session.nama}`}</h1>
    {session.wajibGantiPassword ? <PasswordChangeForm endpoint="/api/auth/lms/ganti-password" requireCurrentPassword={false} title="Buat password baru" description="Password baru minimal 6 karakter dan berbeda dari password awal. Setelah disimpan, masuk kembali." onChanged={() => navigate("/lms/login", { state: { changed: true }, replace: true })} buttonClassName={button} /> : <><p className="mt-4 text-sm text-slate-600">Login {session.peran.toLowerCase()} aktif untuk uji lokal.</p><LmsSchedule role={session.peran} /><LmsLearning role={session.peran} /></>}
    {!session.wajibGantiPassword && session.peran === "GURU" && <PasswordChangeForm endpoint="/api/auth/lms/ganti-password" onChanged={() => navigate("/lms/login", { state: { changed: true }, replace: true })} />}
    {!session.wajibGantiPassword && session.peran === "GURU" && <TeacherPasswordReset />}
    {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}<button disabled={busy} type="button" onClick={logout} className="mt-5 text-sm font-semibold text-[#80643a] underline">Keluar</button>
  </div></main>;
}
