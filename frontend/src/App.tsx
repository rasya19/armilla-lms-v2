import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { LandingPage } from "./components/LandingPage";
import { MasterDashboard } from "./components/MasterDashboard";
import { SchoolRegistration } from "./components/SchoolRegistration";
import { SchoolHome, SchoolLogin } from "./components/SchoolAccess";
import { PublicPPDB } from "./components/SchoolForms";
import { LmsHome, LmsLogin } from "./components/LmsAccess";

function Unavailable() {
  return <main className="min-h-screen bg-slate-950 px-6 py-24 text-white"><div className="mx-auto max-w-lg"><h1 className="text-3xl font-bold">Fitur belum tersedia</h1><p className="mt-4 leading-7 text-slate-300">Layanan ini sedang disiapkan dan belum menerima data. Silakan kembali ke halaman utama.</p><Link className="mt-8 inline-block text-amber-300 underline" to="/">Kembali ke beranda</Link></div></main>;
}

function MasterLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/master/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (!contentType?.includes("application/json")) {
          throw new Error("Server login tidak dapat dihubungi. Pastikan backend berjalan, lalu coba lagi.");
        }
        let message = "Layanan login tidak tersedia. Periksa backend dan coba lagi.";
        try {
          const data: { error?: string } = await response.json();
          if (typeof data.error === "string" && data.error) message = data.error;
        } catch (error) {
          console.error("Respons login tidak valid:", error);
        }
        throw new Error(message);
      }
      setPassword("");
      navigate("/master");
    } catch (error) {
      if (error instanceof TypeError) {
        console.error("Gagal menghubungi layanan login:", error);
        setError("Server login tidak dapat dihubungi. Pastikan backend berjalan, lalu coba lagi.");
      } else {
        setError(error instanceof Error ? error.message : "Layanan login tidak tersedia.");
      }
    } finally {
      setBusy(false);
    }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#0c192d] px-5 py-12 text-white"><div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#14243a] p-8 shadow-2xl"><LockKeyhole className="text-[#dfc18d]" size={28} /><h1 className="mt-5 text-2xl font-bold">Login Master Admin</h1><p className="mt-2 text-sm leading-6 text-slate-300">Masuk menggunakan akun master yang dibuat oleh pengelola sistem.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm font-semibold">Email<input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm font-semibold">Kata sandi<input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-white" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-[#dfc18d] px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button></form><Link className="mt-6 inline-block text-sm text-slate-300 underline" to="/">Kembali ke beranda</Link></div></main>;
}

function MasterHome() {
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">("loading");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/master/session", { signal: controller.signal }).then(async (response) => {
      if (response.status === 401) { setStatus("unauthorized"); return; }
      if (!response.ok) throw new Error("Gagal memeriksa sesi.");
      const data = await response.json();
      setName(data.nama);
      setStatus("ready");
    }).catch((error) => {
      if (!controller.signal.aborted) { console.error(error); setStatus("error"); }
    });
    return () => controller.abort();
  }, []);

  async function logout() {
    setError("");
    try {
      const response = await fetch("/api/auth/master/logout", { method: "POST" });
      if (!response.ok) throw new Error("Gagal keluar. Silakan coba kembali.");
      navigate("/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal keluar.");
    }
  }

  if (status === "unauthorized") return <Navigate to="/master/login" replace />;
  if (status !== "ready") return <main className="min-h-screen bg-slate-950 p-10 text-white">{status === "loading" ? "Memeriksa sesi..." : "Layanan sesi tidak tersedia. Muat ulang halaman untuk mencoba kembali."}</main>;
  return <MasterDashboard name={name || "Master Admin"} error={error} onLogout={logout} />;
}

export default function App() {
  return <Routes><Route path="/" element={<LandingPage />} /><Route path="/daftar" element={<SchoolRegistration />} /><Route path="/login" element={<SchoolLogin />} /><Route path="/sekolah" element={<SchoolHome />} /><Route path="/lms/login" element={<LmsLogin />} /><Route path="/lms" element={<LmsHome />} /><Route path="/ppdb/:slug" element={<PublicPPDB />} /><Route path="/master/login" element={<MasterLogin />} /><Route path="/master" element={<MasterHome />} /><Route path="*" element={<Unavailable />} /></Routes>;
}
