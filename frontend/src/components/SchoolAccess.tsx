import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { SchoolData } from "./SchoolData";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation } from "./LoginNavigation";

export function SchoolLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordHelp, setShowPasswordHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sekolah/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) {
        let message = "Layanan login sekolah tidak tersedia.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") message = data.error;
        }
        throw new Error(message);
      }
      setPassword("");
      navigate("/sekolah");
    } catch (error) {
      console.error("Login sekolah gagal:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi." : error instanceof Error ? error.message : "Login gagal.");
    } finally { setBusy(false); }
  }
  return <main className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <p className="master-eyebrow">KESETARAAN LMS / SEKOLAH</p><h1 className="mt-3 text-2xl font-bold">Login Admin Sekolah</h1>
    <p className="mt-3 text-sm text-slate-700">Akses admin sekolah masih dalam tahap pengujian.</p>
    {location.state?.passwordChanged === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <LoginNavigation />
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input mt-2 w-full rounded-xl px-4 py-3" /></label>
      <div><div className="flex items-center justify-between gap-2"><label htmlFor="school-login-password" className="text-sm font-semibold">Kata sandi</label><button type="button" aria-expanded={showPasswordHelp} aria-controls="school-password-help" onClick={() => setShowPasswordHelp((visible) => !visible)} className="text-sm font-semibold text-indigo-800 underline">Lupa password</button></div><div className="relative mt-2"><input id="school-login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input w-full rounded-xl py-3 pl-4 pr-12" /><button type="button" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-600"><span aria-hidden="true">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</span></button></div><p id="school-password-help" hidden={!showPasswordHelp} className="mt-2 text-sm text-slate-700">Pemulihan melalui email belum tersedia. Hubungi pengelola Rasyatech Admin untuk bantuan akses akun.</p></div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}<button disabled={busy} className="master-primary w-full py-3 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button>
    </form>
    <Link to="/" className="mt-4 inline-block text-sm font-semibold text-indigo-800 underline">Kembali ke beranda</Link>
  </div></main>;
}

export function SchoolHome() {
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [school, setSchool] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/sekolah/session", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setStatus("unauthorized"); return; }
      if (!response.ok) throw new Error("Gagal memeriksa sesi sekolah.");
      const data: unknown = await response.json();
      if (typeof data !== "object" || data === null || !("sekolah" in data) || typeof data.sekolah !== "string" || !("slug" in data) || typeof data.slug !== "string") throw new Error("Respons sesi tidak valid.");
      setSchool(data.sekolah);
      setSlug(data.slug);
      setStatus("ready");
    }).catch((error: unknown) => { if (!controller.signal.aborted) { console.error(error); setStatus("error"); } });
    return () => controller.abort();
  }, []);
  async function logout() {
    try {
      const response = await fetch("/api/auth/sekolah/logout", { method: "POST" });
      if (!response.ok) throw new Error("Gagal keluar. Coba lagi.");
      navigate("/login");
    } catch (error) { console.error(error); setError("Gagal keluar. Coba lagi."); }
  }
  if (status === "unauthorized") return <Navigate to="/login" replace />;
  if (status !== "ready") return <main className="school-dashboard min-h-screen p-8 text-white">{status === "loading" ? "Memeriksa sesi..." : "Sesi tidak tersedia. Muat ulang halaman."}</main>;
  return <main className="school-dashboard glass-area min-h-screen p-4 sm:p-6"><div className="mx-auto max-w-4xl"><div className="glass-panel flex justify-between gap-4 rounded-3xl p-5 sm:p-7"><div><p className="master-eyebrow">ADMIN SEKOLAH · PENGUJIAN</p><h1 className="mt-2 break-words text-2xl font-bold sm:text-3xl">{school}</h1></div><button onClick={logout} className="master-primary self-start">Keluar</button></div>{error && <p role="alert" className="glass-panel mt-4 rounded-xl p-4 text-rose-700">{error}</p>}<PasswordChangeForm endpoint="/api/auth/sekolah/ganti-password" onChanged={() => navigate("/login", { state: { passwordChanged: true }, replace: true })} description="Verifikasi password saat ini sebelum membuat password baru." className="glass-panel mt-4 rounded-2xl p-5" inputClassName="glass-input mt-2 w-full rounded-xl px-4 py-3" buttonClassName="master-primary py-3 disabled:opacity-50" /><SchoolData slug={slug} /></div></main>;
}
