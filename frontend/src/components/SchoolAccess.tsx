import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { SchoolData } from "./SchoolData";

export function SchoolLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
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
  return <main className="flex min-h-screen items-center justify-center bg-[#0c192d] px-5 py-12 text-white"><div className="w-full max-w-md rounded-3xl bg-[#14243a] p-8"><h1 className="text-2xl font-bold">Login Admin Sekolah</h1><p className="mt-3 text-sm text-slate-300">Akses sementara untuk pengujian lokal. Akun dibuat melalui terminal.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block text-sm font-semibold">Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3" /></label><label className="block text-sm font-semibold">Kata sandi<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3" /></label>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-[#dfc18d] px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button></form><Link to="/lms/login" className="mt-6 block text-sm text-[#dfc18d] underline">Login guru dan siswa</Link><Link to="/" className="mt-4 inline-block text-sm text-slate-300 underline">Kembali ke beranda</Link></div></main>;
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
  if (status !== "ready") return <main className="p-8">{status === "loading" ? "Memeriksa sesi..." : "Sesi tidak tersedia. Muat ulang halaman."}</main>;
  return <main className="min-h-screen bg-[#f7f6f1] p-6 text-[#142137]"><div className="mx-auto max-w-4xl"><div className="flex justify-between gap-4"><div><p className="text-sm text-[#80643a]">Admin sekolah · Uji lokal</p><h1 className="mt-2 text-3xl font-bold">{school}</h1></div><button onClick={logout} className="self-start rounded-xl bg-[#0c192d] px-4 py-2 text-white">Keluar</button></div>{error && <p role="alert" className="mt-4 text-rose-700">{error}</p>}<SchoolData slug={slug} /></div></main>;
}
