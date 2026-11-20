import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { LandingPage } from "./components/LandingPage";
import { MasterDashboard } from "./components/MasterDashboard";
import { SchoolRegistration } from "./components/SchoolRegistration";
import { SchoolHome, SchoolLogin } from "./components/SchoolAccess";
import { PublicPPDB } from "./components/SchoolForms";
import { LmsHome, LmsLogin } from "./components/LmsAccess";
import { DinasHome, DinasLogin } from "./components/DinasDashboard";
import { PortalSpinner } from "./components/DashboardUI";
import {
  clearAuthCache,
  getAuthCache,
  saveAuthCache,
  type MasterAuthCache,
} from "./components/authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./components/fetchWithTimeout";

function Unavailable({ schoolLogin = false }: { schoolLogin?: boolean }) {
  return <main className="min-h-screen bg-slate-950 px-6 py-24 text-white"><div className="mx-auto max-w-lg"><h1 className="text-3xl font-bold">{schoolLogin ? "Masuk melalui subdomain sekolah" : "Fitur belum tersedia"}</h1><p className="mt-4 leading-7 text-slate-300">{schoolLogin ? "Gunakan alamat login sekolah Anda. Hubungi admin sekolah jika belum mengetahui alamatnya." : "Layanan ini sedang disiapkan dan belum menerima data. Silakan kembali ke halaman utama."}</p><Link className="mt-8 inline-block text-amber-300 underline" to="/">Kembali ke beranda</Link></div></main>;
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
      const response = await fetchWithTimeout("/api/auth/master/login", {
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
        } catch (parseError) {
          console.error("Respons login tidak valid:", parseError);
        }
        throw new Error(message);
      }
      try {
        const data: unknown = await response.json();
        if (typeof data === "object" && data !== null) {
          const payload = data as { nama?: string; peran?: string; token?: string; user?: { nama?: string; peran?: string } };
          if (typeof payload.nama === "string") {
            saveAuthCache<MasterAuthCache>("master", {
              token: payload.token,
              nama: payload.nama,
              peran: payload.peran,
              user: payload.user,
              updatedAt: Date.now(),
            });
          }
        }
      } catch {
        // Ignore optional body parse errors
      }
      setPassword("");
      navigate("/master");
    } catch (failure) {
      setError(describeFetchError(failure, "Layanan login tidak tersedia."));
    } finally {
      setBusy(false);
    }
  }

  return <main className="master-auth glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="master-login glass-login w-full max-w-md rounded-2xl p-6"><span className="master-logo"><LockKeyhole size={21} /></span><p className="master-eyebrow mt-4">KESETARAAN LMS / MASTER ADMIN</p><h1 className="mt-2 text-2xl font-bold text-white">Login Master Admin</h1><p className="mt-2 text-sm leading-6 text-slate-300">Masuk menggunakan akun master yang dibuat oleh pengelola sistem.</p><form onSubmit={submit} className="mt-5 space-y-3"><label className="block text-sm font-semibold text-slate-200">Email<input className="master-field mt-2 w-full rounded-xl px-4 py-2.5" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm font-semibold text-slate-200">Kata sandi<input className="master-field mt-2 w-full rounded-xl px-4 py-2.5" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={busy} className="master-primary w-full py-3 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button></form><Link className="mt-4 inline-block text-sm font-semibold text-indigo-200 underline" to="/">Kembali ke beranda</Link></div></main>;
}

function MasterHome() {
  const initialCache = getAuthCache<MasterAuthCache>("master");
  const [name, setName] = useState<string | null>(() => initialCache?.nama ?? null);
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "error">(() => (initialCache ? "ready" : "loading"));
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout("/api/auth/master/session", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          clearAuthCache("master");
          setStatus("unauthorized");
          return;
        }
        if (!response.ok) throw new Error("Gagal memeriksa sesi.");
        const data = (await response.json()) as { nama?: string; peran?: string };
        if (typeof data.nama === "string") {
          setName(data.nama);
          saveAuthCache<MasterAuthCache>("master", {
            token: initialCache?.token,
            nama: data.nama,
            peran: data.peran,
            updatedAt: Date.now(),
          });
        }
        setStatus("ready");
      })
      .catch((failure) => {
        if (!isCallerAborted(failure, controller.signal)) {
          if (!initialCache) {
            setError(describeFetchError(failure, "Layanan sesi tidak tersedia."));
            setStatus("error");
          } else {
            setError(describeFetchError(failure, "Gagal memvalidasi ulang sesi di latar belakang."));
          }
        }
      });
    return () => controller.abort();
  }, []);

  async function logout() {
    setError("");
    try {
      const response = await fetchWithTimeout("/api/auth/master/logout", { method: "POST" });
      if (!response.ok) throw new Error("Gagal keluar. Silakan coba kembali.");
      clearAuthCache("master");
      navigate("/");
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal keluar."));
    }
  }

  if (status === "unauthorized") return <Navigate to="/master/login" replace />;
  if (status === "loading") return <PortalSpinner label="Memuat dashboard" />;
  if (status !== "ready") return <main className="min-h-screen bg-slate-950 p-10 text-white">{error || "Layanan sesi tidak tersedia. Muat ulang halaman untuk mencoba kembali."}</main>;
  return <MasterDashboard name={name || "Master Admin"} error={error} onLogout={logout} />;
}

function AppRoutes() {
  return <Routes><Route path="/" element={<LandingPage />} /><Route path="/daftar" element={<SchoolRegistration />} /><Route path="/login" element={<SchoolLogin />} /><Route path="/sekolah" element={<SchoolHome />} /><Route path="/lms/login" element={<LmsLogin />} /><Route path="/lms" element={<LmsHome />} /><Route path="/ppdb/:slug" element={<PublicPPDB />} /><Route path="/dinas/login" element={<DinasLogin />} /><Route path="/dinas" element={<DinasHome />} /><Route path="/dinas/berita-acara" element={<DinasHome />} /><Route path="/dinas/arsip-berita-acara" element={<DinasHome />} /><Route path="/master/login" element={<MasterLogin />} /><Route path="/master" element={<MasterHome />} /><Route path="*" element={<Unavailable />} /></Routes>;
}

export default function App() {
  const hostname = window.location.hostname.toLowerCase();
  const baseDomains = ["pkbm.siput.id", "rsch.my.id"];
  const matchedBase = baseDomains.find(
    (domain) => hostname === domain || hostname === `www.${domain}` || hostname.endsWith(`.${domain}`),
  );
  const mainDomain = !!matchedBase && (hostname === matchedBase || hostname === `www.${matchedBase}`);
  const schoolDomain = !!matchedBase && !mainDomain;
  const [status, setStatus] = useState<"ready" | "missing">("ready");
  const [contextWarning, setContextWarning] = useState("");

  useEffect(() => {
    if (!schoolDomain) return;
    const controller = new AbortController();
    fetchWithTimeout("/api/tenant/context", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error("Gagal memeriksa sekolah.");
        const data: unknown = await response.json();
        if (typeof data !== "object" || data === null || !("kind" in data) || data.kind !== "school") {
          throw new Error("Respons sekolah tidak valid.");
        }
        setContextWarning("");
        setStatus("ready");
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setContextWarning(describeFetchError(failure, "Koneksi ke server sekolah sedang lambat."));
        }
      });
    return () => controller.abort();
  }, [schoolDomain]);

  if (status === "missing") return <main className="glass-shell flex min-h-screen items-center justify-center p-6"><div className="glass-panel max-w-md rounded-3xl p-6"><h1 className="text-2xl font-bold">Sekolah / Lembaga Tidak Terdaftar (404)</h1><p className="mt-4 text-sm">Sekolah tidak ditemukan atau tidak aktif.</p><a className="master-primary mt-5 inline-block" href={`https://${matchedBase ?? "pkbm.siput.id"}`}>Kembali ke domain utama</a></div></main>;
  if (mainDomain) return <Routes><Route path="/" element={<LandingPage />} /><Route path="/daftar" element={<SchoolRegistration />} /><Route path="/login" element={<Unavailable schoolLogin />} /><Route path="/lms/login" element={<Unavailable schoolLogin />} /><Route path="/dinas/login" element={<DinasLogin />} /><Route path="/dinas" element={<DinasHome />} /><Route path="/dinas/berita-acara" element={<DinasHome />} /><Route path="/dinas/arsip-berita-acara" element={<DinasHome />} /><Route path="/master/login" element={<MasterLogin />} /><Route path="/master" element={<MasterHome />} /><Route path="*" element={<Unavailable />} /></Routes>;
  if (schoolDomain) {
    return (
      <>
        {contextWarning && (
          <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-950/90 px-4 py-2 text-xs font-medium text-amber-100 backdrop-blur">
            <span>{contextWarning}</span>
            <button type="button" onClick={() => setContextWarning("")} className="underline">Tutup</button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<SchoolLogin />} />
          <Route path="/sekolah" element={<SchoolHome />} />
          <Route path="/lms/login" element={<LmsLogin />} />
          <Route path="/lms" element={<LmsHome />} />
          <Route path="/ppdb/:slug" element={<PublicPPDB />} />
          <Route path="/dinas/login" element={<DinasLogin />} />
          <Route path="/dinas" element={<DinasHome />} />
          <Route path="/dinas/berita-acara" element={<DinasHome />} />
          <Route path="/dinas/arsip-berita-acara" element={<DinasHome />} />
          <Route path="*" element={<Unavailable />} />
        </Routes>
      </>
    );
  }
  return <AppRoutes />;
}
