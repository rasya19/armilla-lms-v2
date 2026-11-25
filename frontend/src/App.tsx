import { Suspense, lazy, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { BrandLogo } from "./components/BrandLogo";
import { PortalSpinner } from "./components/DashboardUI";
import {
  clearAuthCache,
  getAuthCache,
  saveAuthCache,
  type MasterAuthCache,
} from "./components/authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./components/fetchWithTimeout";
import { formatEndDateId } from "./components/trialDates";

const LandingPage = lazy(() => import("./components/LandingPage").then((m) => ({ default: m.LandingPage })));
const PublicSchoolPortal = lazy(() => import("./components/PublicSchoolPortal").then((m) => ({ default: m.PublicSchoolPortal })));
const MasterDashboard = lazy(() => import("./components/MasterDashboard").then((m) => ({ default: m.MasterDashboard })));
const SchoolRegistration = lazy(() => import("./components/SchoolRegistration").then((m) => ({ default: m.SchoolRegistration })));
const SchoolHome = lazy(() => import("./components/SchoolAccess").then((m) => ({ default: m.SchoolHome })));
const SchoolLogin = lazy(() => import("./components/SchoolAccess").then((m) => ({ default: m.SchoolLogin })));
const PublicPPDB = lazy(() => import("./components/SchoolForms").then((m) => ({ default: m.PublicPPDB })));
const PublicGuestbookPage = lazy(() => import("./components/PublicGuestbookPage").then((m) => ({ default: m.PublicGuestbookPage })));
const LmsHome = lazy(() => import("./components/LmsAccess").then((m) => ({ default: m.LmsHome })));
const LmsLogin = lazy(() => import("./components/LmsAccess").then((m) => ({ default: m.LmsLogin })));
const DinasHome = lazy(() => import("./components/DinasDashboard").then((m) => ({ default: m.DinasHome })));
const DinasLogin = lazy(() => import("./components/DinasDashboard").then((m) => ({ default: m.DinasLogin })));

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

  return <main className="master-auth glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="master-login glass-login w-full max-w-md rounded-2xl p-6"><BrandLogo alt="Logo SIPUT PKBM" className="h-12 w-12 rounded-xl border border-white/15" /><p className="master-eyebrow mt-4">SIPUT PKBM / MASTER ADMIN</p><h1 className="mt-2 text-2xl font-bold text-white">Login Master Admin</h1><p className="mt-2 text-sm leading-6 text-slate-300">Masuk menggunakan akun master yang dibuat oleh pengelola sistem.</p><form onSubmit={submit} className="mt-5 space-y-3"><label className="block text-sm font-semibold text-slate-200">Email<input className="master-field mt-2 w-full rounded-xl px-4 py-2.5" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label><label className="block text-sm font-semibold text-slate-200">Kata sandi<input className="master-field mt-2 w-full rounded-xl px-4 py-2.5" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}<button disabled={busy} className="master-primary w-full py-3 disabled:opacity-50">{busy ? "Memeriksa..." : "Masuk"}</button></form><Link className="mt-4 inline-block text-sm font-semibold text-indigo-200 underline" to="/">Kembali ke beranda</Link></div></main>;
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
  return (
    <Suspense fallback={<PortalSpinner label="Memuat halaman" />}>
      <Routes><Route path="/" element={<LandingPage />} /><Route path="/daftar" element={<SchoolRegistration />} /><Route path="/login" element={<SchoolLogin />} /><Route path="/sekolah" element={<SchoolHome />} /><Route path="/lms/login" element={<LmsLogin />} /><Route path="/lms" element={<LmsHome />} /><Route path="/ppdb/:slug" element={<PublicPPDB />} /><Route path="/buku-tamu/:slug" element={<PublicGuestbookPage />} /><Route path="/dinas/login" element={<DinasLogin />} /><Route path="/dinas" element={<DinasHome />} /><Route path="/dinas/berita-acara" element={<DinasHome />} /><Route path="/dinas/arsip-berita-acara" element={<DinasHome />} /><Route path="/master/login" element={<MasterLogin />} /><Route path="/master" element={<MasterHome />} /><Route path="*" element={<Unavailable />} /></Routes>
    </Suspense>
  );
}

export default function App() {
  const hostname = window.location.hostname.toLowerCase();
  const baseDomains = ["pkbm.siput.id", "rsch.my.id"];
  const matchedBase = baseDomains.find(
    (domain) => hostname === domain || hostname === `www.${domain}` || hostname.endsWith(`.${domain}`),
  );
  const mainDomain = !!matchedBase && (hostname === matchedBase || hostname === `www.${matchedBase}`);
  const schoolDomain = !!matchedBase && !mainDomain;
  const subdomainSlug = schoolDomain && matchedBase ? hostname.slice(0, -(matchedBase.length + 1)) : "";
  const [status, setStatus] = useState<"ready" | "missing">("ready");
  const [missingInfo, setMissingInfo] = useState<{ code?: string; error?: string; expiresAt?: string | null } | null>(null);
  const [contextWarning, setContextWarning] = useState("");

  useEffect(() => {
    if (!schoolDomain) return;
    const controller = new AbortController();
    fetchWithTimeout("/api/tenant/context", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          const errBody = (await response.json().catch(() => null)) as {
            code?: string;
            error?: string;
            expiresAt?: string | null;
          } | null;
          setMissingInfo(errBody);
          setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error("Gagal memeriksa sekolah.");
        const data: unknown = await response.json();
        const root = typeof data === "object" && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
        const nested =
          root && typeof root.data === "object" && root.data !== null && !Array.isArray(root.data)
            ? (root.data as Record<string, unknown>)
            : root && typeof root.school === "object" && root.school !== null && !Array.isArray(root.school)
              ? (root.school as Record<string, unknown>)
              : root;
        const isSchoolContext =
          nested !== null &&
          nested.kind !== "main" &&
          (nested.kind === "school" || (typeof nested.id === "string" && typeof nested.slug === "string"));
        if (!isSchoolContext) {
          throw new Error("Respons sekolah tidak valid.");
        }
        setContextWarning("");
        setMissingInfo(null);
        setStatus("ready");
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setContextWarning(describeFetchError(failure, "Koneksi ke server sekolah sedang lambat."));
        }
      });
    return () => controller.abort();
  }, [schoolDomain]);

  if (status === "missing") {
    const isExpired = missingInfo?.code === "TENANT_EXPIRED";
    return (
      <main className="glass-shell flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md rounded-3xl p-7">
          <h1 className="text-2xl font-bold text-slate-900">
            {isExpired ? "Masa Uji Coba 14 Hari Berakhir" : "Sekolah / Lembaga Tidak Terdaftar (404)"}
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            {isExpired
              ? `Akses portal sekolah (${subdomainSlug}.${matchedBase ?? "pkbm.siput.id"}) otomatis diblokir karena masa uji coba / masa aktif telah berakhir${
                  missingInfo?.expiresAt ? ` pada ${formatEndDateId(missingInfo.expiresAt, true)}` : ""
                }. Hubungi admin Rasyatech untuk mengaktifkan atau memperpanjang paket langganan.`
              : missingInfo?.error || "Sekolah tidak ditemukan atau tidak aktif."}
          </p>
          <a className="master-primary mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold" href={`https://${matchedBase ?? "pkbm.siput.id"}`}>
            Kembali ke domain utama
          </a>
        </div>
      </main>
    );
  }
  if (mainDomain) {
    return (
      <Suspense fallback={<PortalSpinner label="Memuat halaman" />}>
        <Routes><Route path="/" element={<LandingPage />} /><Route path="/daftar" element={<SchoolRegistration />} /><Route path="/buku-tamu/:slug" element={<PublicGuestbookPage />} /><Route path="/login" element={<Unavailable schoolLogin />} /><Route path="/lms/login" element={<Unavailable schoolLogin />} /><Route path="/dinas/login" element={<DinasLogin />} /><Route path="/dinas" element={<DinasHome />} /><Route path="/dinas/berita-acara" element={<DinasHome />} /><Route path="/dinas/arsip-berita-acara" element={<DinasHome />} /><Route path="/master/login" element={<MasterLogin />} /><Route path="/master" element={<MasterHome />} /><Route path="*" element={<Unavailable />} /></Routes>
      </Suspense>
    );
  }
  if (schoolDomain) {
    return (
      <>
        {contextWarning && (
          <div role="status" className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-amber-950/90 px-4 py-2 text-xs font-medium text-amber-100 backdrop-blur">
            <span>{contextWarning}</span>
            <button type="button" onClick={() => setContextWarning("")} className="underline">Tutup</button>
          </div>
        )}
        <Suspense fallback={<PortalSpinner label="Memuat portal sekolah" />}>
          <Routes>
            <Route path="/" element={<PublicSchoolPortal />} />
            <Route path="/login" element={<SchoolLogin />} />
            <Route path="/sekolah" element={<SchoolHome />} />
            <Route path="/lms/login" element={<LmsLogin />} />
            <Route path="/lms" element={<LmsHome />} />
            <Route path="/ppdb/:slug" element={<PublicPPDB />} />
            <Route path="/buku-tamu/:slug" element={<PublicGuestbookPage />} />
            <Route path="/dinas/login" element={<DinasLogin />} />
            <Route path="/dinas" element={<DinasHome />} />
            <Route path="/dinas/berita-acara" element={<DinasHome />} />
            <Route path="/dinas/arsip-berita-acara" element={<DinasHome />} />
            <Route path="*" element={<Unavailable />} />
          </Routes>
        </Suspense>
      </>
    );
  }
  return <AppRoutes />;
}
