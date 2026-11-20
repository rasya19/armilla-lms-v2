import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { LmsSchedule } from "./LmsSchedule";
import { Classroom } from "./Classroom";
import { TenantThemeProvider } from "./TenantThemeProvider";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation } from "./LoginNavigation";
import { DashboardHero, PortalSpinner } from "./DashboardUI";
import { BookOpen, CalendarDays, Home, UserRound } from "lucide-react";

type Session = { nama: string; peran: "SISWA" | "GURU"; wajibGantiPassword: boolean };
const input = "glass-input mt-2 w-full rounded-xl px-4 py-3";
const button = "master-primary w-full py-3 disabled:opacity-50";
const hashNav: Record<string, string> = { "#beranda-lms": "beranda", "#jadwal-lms": "jadwal", "#pembelajaran-lms": "materi", "#profil-lms": "profil", "#akses-lms": "profil" };

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
    <p className="master-eyebrow">KESETARAAN LMS / PEMBELAJARAN</p><h1 className="mt-3 text-2xl font-bold">Login Guru dan Siswa</h1><p className="mt-3 text-sm text-slate-700">Gunakan akun LMS yang dibuat oleh admin sekolah.</p>
    {location.state?.changed === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <LoginNavigation />
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">Peran<select className={input} value={peran} onChange={(e) => { setPeran(e.target.value === "GURU" ? "GURU" : "SISWA"); setIdentitas(""); }}><option value="SISWA">Siswa</option><option value="GURU">Guru</option></select></label>
      <label className="block text-sm font-semibold">{peran === "SISWA" ? "NISN" : "Email"}<input className={input} required maxLength={254} autoComplete="username" value={identitas} onChange={(e) => setIdentitas(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Kata sandi<input className={input} type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className={button}>{busy ? "Memeriksa..." : "Masuk"}</button>
    </form><Link className="mt-4 inline-block text-sm font-semibold text-indigo-800 underline" to="/">Kembali ke beranda</Link>
  </div></main>;
}

export function LmsHome() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeNav, setActiveNav] = useState(() => hashNav[window.location.hash] ?? "beranda");
  const navigate = useNavigate();
  useEffect(() => {
    const sync = () => setActiveNav(hashNav[window.location.hash] ?? "beranda");
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
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
  if (status === "loading") return <PortalSpinner label="Memuat portal LMS" />;
  if (status !== "ready" || !session) return <main className="min-h-screen bg-slate-950 p-8 text-white">Layanan sesi tidak tersedia. Muat ulang halaman.</main>;
  return <TenantThemeProvider scope="lms"><main className="dashboard-canvas glass-area min-h-screen text-slate-800">
    <header id="profil-lms" className="dashboard-header sticky top-0 z-30 border-b px-5 py-3"><div className="mx-auto flex max-w-6xl items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 font-bold text-white">{session.nama.charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><h1 className="truncate font-bold">{session.nama}</h1><p className="text-xs font-semibold text-indigo-700">{session.peran === "GURU" ? "Guru" : "Siswa"}</p></div><button disabled={busy} type="button" onClick={logout} className="rounded-xl border border-indigo-200 bg-white/70 px-4 py-2 text-sm font-bold text-indigo-700 disabled:opacity-50">Keluar</button></div></header>
    <div className="animate-page-enter mx-auto max-w-6xl space-y-5 px-4 py-6 pb-28 sm:px-6 md:pb-6">
      <div id="beranda-lms" className="scroll-mt-24"><DashboardHero title={session.wajibGantiPassword ? "Wajib ganti password" : `Selamat datang, ${session.nama}`} description={session.wajibGantiPassword ? "Buat password baru untuk melanjutkan." : "Akses jadwal dan kegiatan pembelajaran Anda."} badge={session.peran === "GURU" ? "Portal Guru" : "Portal Siswa"} /></div>
      {session.wajibGantiPassword ? <div className="dashboard-glass p-5"><PasswordChangeForm endpoint="/api/auth/lms/ganti-password" requireCurrentPassword={false} title="Buat password baru" description="Password baru minimal 6 karakter dan berbeda dari password awal. Setelah disimpan, masuk kembali." onChanged={() => navigate("/lms/login", { state: { changed: true }, replace: true })} buttonClassName={button} /></div> : <><nav aria-label="Navigasi pembelajaran" className="dashboard-glass flex flex-wrap gap-2 p-3"><a href="#jadwal-lms" className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">Jadwal</a><a href="#pembelajaran-lms" className="rounded-full bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800">Ruang KBM</a>{session.peran === "GURU" && <a href="#akses-lms" className="rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700">Pengaturan akses</a>}</nav><div id="jadwal-lms" className="scroll-mt-24"><LmsSchedule role={session.peran} /></div><div id="pembelajaran-lms" className="scroll-mt-24"><Classroom role={session.peran} /></div></>}
      {!session.wajibGantiPassword && session.peran === "GURU" && <div id="akses-lms" className="dashboard-glass scroll-mt-24 p-5"><PasswordChangeForm endpoint="/api/auth/lms/ganti-password" onChanged={() => navigate("/lms/login", { state: { changed: true }, replace: true })} /><TeacherPasswordReset /></div>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
    {!session.wajibGantiPassword && <nav aria-label="Navigasi bawah pembelajaran" className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/70 bg-white/80 px-1 pt-2 shadow-[0_-8px_30px_rgba(79,70,229,0.08)] backdrop-blur-xl md:hidden" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
      {[
        { id: "beranda", label: "Beranda", href: "#beranda-lms", icon: Home },
        { id: "jadwal", label: "Jadwal", href: "#jadwal-lms", icon: CalendarDays },
        { id: "materi", label: "Ruang KBM", href: "#pembelajaran-lms", icon: BookOpen },
        { id: "profil", label: session.peran === "GURU" ? "Akses" : "Profil", href: session.peran === "GURU" ? "#akses-lms" : "#profil-lms", icon: UserRound },
      ].map(({ id, label, href, icon: Icon }) => <a key={id} href={href} onClick={() => setActiveNav(id)} aria-current={activeNav === id ? "page" : undefined} className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${activeNav === id ? "font-semibold text-indigo-600" : "font-medium text-slate-600"}`}><span className={`rounded-xl p-1.5 ${activeNav === id ? "bg-indigo-50/80" : ""}`}><Icon size={20} /></span>{label}</a>)}
    </nav>}
  </main></TenantThemeProvider>;
}
