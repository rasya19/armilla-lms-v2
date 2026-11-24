import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { TeacherPasswordReset } from "./TeacherPasswordReset";
import { LmsSchedule } from "./LmsSchedule";
import { Classroom } from "./Classroom";
import { normalizeThemeKey, savePreferredTheme, TenantThemeProvider, useTenantTheme, type ThemeKey } from "./TenantThemeProvider";
import { unwrapSchoolPayload } from "./schoolProfile";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { LoginNavigation, type LoginRole } from "./LoginNavigation";
import { BrandLogo } from "./BrandLogo";
import { DashboardHero, PortalSpinner } from "./DashboardUI";
import { BookOpen, CalendarDays, CheckCircle2, Eye, EyeOff, Home, UserRound } from "lucide-react";
import { StudentVervalForm } from "./StudentVervalForm";
import {
  clearAuthCache,
  deriveTenantSlugFromHost,
  formatSlugDisplayName,
  getAuthCache,
  getCachedTenantProfile,
  saveAuthCache,
  saveCachedTenantProfile,
  type LmsAuthCache,
} from "./authSessionCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import { TeacherPortal } from "./TeacherPortal";
import { StudentPortal } from "./StudentPortal";

type StudentTodayAttendance = {
  tanggal: string;
  status: "HADIR" | "IZIN" | "SAKIT" | "ALPA" | null;
  keterangan: string | null;
  waktuHadir: string | null;
};

type Session = {
  nama: string;
  peran: "SISWA" | "GURU";
  wajibGantiPassword: boolean;
  sekolah?: string;
  slug?: string;
  plan?: PlanSlug;
  expiresAt?: string | null;
  email?: string | null;
  nuptk?: string | null;
  telepon?: string | null;
  mapelUtama?: string | null;
  nisn?: string | null;
  kelasId?: string | null;
  kelasNama?: string | null;
  presensiHariIni?: StudentTodayAttendance | null;
};
const input = "glass-input mt-2 w-full rounded-xl px-4 py-3";
const button = "master-primary w-full py-3 disabled:opacity-50";
const hashNav: Record<string, string> = { "#beranda-lms": "beranda", "#jadwal-lms": "jadwal", "#pembelajaran-lms": "materi", "#biodata-dapodik": "biodata", "#profil-lms": "profil", "#akses-lms": "profil" };

async function post<T = unknown>(url: string, body?: object): Promise<T | null> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let message = `Permintaan gagal (status ${response.status}).`;
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data: unknown = await response.json();
      if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") message = data.error;
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  if (response.headers.get("content-type")?.includes("application/json")) {
    return (await response.json()) as T;
  }
  return null;
}

export function LmsLogin() {
  const hostSlug = deriveTenantSlugFromHost();
  const initialProfile = hostSlug ? getCachedTenantProfile(hostSlug) : null;
  const [schoolName, setSchoolName] = useState<string>(() => initialProfile?.nama ?? formatSlugDisplayName(hostSlug));
  const [logoUrl, setLogoUrl] = useState<string | null>(() => initialProfile?.logoUrl ?? null);
  const [theme, setTheme] = useState<ThemeKey>(() => normalizeThemeKey(initialProfile?.themeKey, "ocean"));
  const navigate = useNavigate();
  const location = useLocation();
  const initialRole = (location.state as { role?: string } | null)?.role === "GURU" ? "GURU" : "SISWA";
  const [peran, setPeran] = useState<"SISWA" | "GURU">(initialRole);
  const [identitas, setIdentitas] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const requested = (location.state as { role?: string } | null)?.role;
    if (requested === "GURU" || requested === "SISWA") {
      setPeran(requested);
    }
  }, [location.state]);

  useEffect(() => {
    const controller = new AbortController();
    const endpoint = hostSlug ? `/api/public/sekolah/${encodeURIComponent(hostSlug)}` : "/api/public/sekolah";
    fetchWithTimeout(endpoint, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const raw: unknown = await response.json();
        const data = unwrapSchoolPayload(raw);
        if (!data) return;
        const resolvedName =
          typeof data.nama === "string" && data.nama.trim()
            ? data.nama.trim()
            : typeof data.name === "string" && data.name.trim()
              ? data.name.trim()
              : "";
        const resolvedSlug = typeof data.slug === "string" && data.slug ? data.slug : hostSlug;
        const resolvedLogo = typeof data.logoUrl === "string" && data.logoUrl ? data.logoUrl : null;
        const resolvedTheme = normalizeThemeKey(data.themeKey, "ocean");
        setTheme(resolvedTheme);
        savePreferredTheme(resolvedTheme);
        if (resolvedName) {
          setSchoolName(resolvedName);
          setLogoUrl(resolvedLogo);
          saveCachedTenantProfile(resolvedSlug, {
            nama: resolvedName,
            slug: resolvedSlug,
            logoUrl: resolvedLogo,
            themeKey: resolvedTheme,
            plan: typeof data.plan === "string" ? data.plan : undefined,
          });
        }
      })
      .catch((failure) => {
        if (!isCallerAborted(failure, controller.signal)) {
          // Keep optimistic slug/cached branding silently
        }
      });
    return () => controller.abort();
  }, [hostSlug]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await post<{
        token?: string;
        nama?: string;
        peran?: "SISWA" | "GURU";
        wajibGantiPassword?: boolean;
        user?: { nama?: string; peran?: "SISWA" | "GURU"; wajibGantiPassword?: boolean };
      }>("/api/auth/lms/login", { peran, identitas, password });
      if (data && typeof data.nama === "string" && (data.peran === "SISWA" || data.peran === "GURU")) {
        saveAuthCache<LmsAuthCache>("lms", {
          token: data.token,
          nama: data.nama,
          peran: data.peran,
          wajibGantiPassword: Boolean(data.wajibGantiPassword),
          user: data.user,
          updatedAt: Date.now(),
        });
      }
      setPassword("");
      navigate("/lms");
    } catch (failure) {
      setError(describeFetchError(failure, "Login gagal."));
    } finally {
      setBusy(false);
    }
  }

  return <main data-tenant-theme={theme} className="glass-shell glass-login-shell flex min-h-screen items-center justify-center px-5 py-5"><div className="glass-panel glass-login w-full max-w-md rounded-3xl p-6">
    <div className="flex items-center gap-3">
      <BrandLogo src={logoUrl} alt={`Logo ${schoolName}`} className="h-11 w-11 rounded-xl border border-white/20" />
      <div className="min-w-0">
        <p className="master-eyebrow">SIPUT PKBM / PEMBELAJARAN</p>
        <p className="truncate text-xs font-bold text-slate-600">{schoolName}</p>
      </div>
    </div>
    <h1 className="mt-3 text-2xl font-bold">{peran === "GURU" ? "Login Guru / Tutor" : "Login Siswa"}</h1>
    <p className="mt-2 text-sm text-slate-700">
      {peran === "GURU"
        ? "Masuk menggunakan email dan kata sandi akun guru dari admin sekolah."
        : "Masuk menggunakan NISN dan kata sandi akun siswa dari admin sekolah."}
    </p>
    {location.state?.changed === true && <p role="status" className="mt-4 text-sm text-green-700">Password berhasil diganti. Silakan masuk kembali.</p>}
    <LoginNavigation
      value={peran}
      disabled={busy}
      onChange={(role: LoginRole) => {
        if (role === "ADMIN") {
          navigate("/login");
          return;
        }
        setPeran(role);
        setIdentitas("");
        setError("");
      }}
    />
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="block text-sm font-semibold">
        {peran === "SISWA" ? "NISN atau Username" : "Email"}
        <input
          className={input}
          required
          maxLength={254}
          autoComplete="username"
          placeholder={peran === "SISWA" ? "Masukkan NISN atau username siswa" : "Masukkan email guru"}
          value={identitas}
          onChange={(e) => setIdentitas(e.target.value)}
        />
      </label>
      <div>
        <label htmlFor="lms-login-password" className="block text-sm font-semibold">Kata sandi</label>
        <div className="relative mt-2">
          <input
            id="lms-login-password"
            className="glass-input w-full rounded-xl py-3 pl-4 pr-12"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-600"
          >
            <span aria-hidden="true">{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</span>
          </button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button disabled={busy} className={button}>{busy ? "Memeriksa..." : "Masuk"}</button>
    </form>
    <Link className="mt-4 inline-block text-sm font-semibold text-indigo-800 underline" to="/">Kembali ke beranda</Link>
  </div></main>;
}

export function LmsHome() {
  const initialCache = getAuthCache<LmsAuthCache>("lms");
  const [session, setSession] = useState<Session | null>(() =>
    initialCache
      ? { nama: initialCache.nama, peran: initialCache.peran, wajibGantiPassword: Boolean(initialCache.wajibGantiPassword) }
      : null,
  );
  const [status, setStatus] = useState<"loading" | "ready" | "unauthorized" | "blocked" | "error">(() => (initialCache ? "ready" : "loading"));
  const [blockedMessage, setBlockedMessage] = useState("");
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
    fetchWithTimeout("/api/auth/lms/session", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          clearAuthCache("lms");
          setStatus("unauthorized");
          return;
        }
        if (response.status === 403) {
          const blockedBody = (await response.json().catch(() => null)) as { code?: string; error?: string } | null;
          if (blockedBody?.code === "TENANT_EXPIRED" || blockedBody?.code === "TENANT_SUSPENDED") {
            clearAuthCache("lms");
            setBlockedMessage(
              blockedBody.error ||
                "Masa uji coba 14 hari / masa aktif lembaga telah berakhir. Akses otomatis diblokir.",
            );
            setStatus("blocked");
            return;
          }
        }
        if (!response.ok) throw new Error("Sesi LMS tidak tersedia.");
        const data: unknown = await response.json();
        if (
          typeof data !== "object" ||
          data === null ||
          !("nama" in data) ||
          typeof data.nama !== "string" ||
          !("peran" in data) ||
          (data.peran !== "SISWA" && data.peran !== "GURU") ||
          !("wajibGantiPassword" in data) ||
          typeof data.wajibGantiPassword !== "boolean"
        ) {
          throw new Error("Respons sesi tidak valid.");
        }
        const raw = data as Record<string, unknown>;
        const rawAttendance = raw.presensiHariIni;
        const presensiHariIni: StudentTodayAttendance | null =
          rawAttendance && typeof rawAttendance === "object" && !Array.isArray(rawAttendance) && typeof (rawAttendance as Record<string, unknown>).tanggal === "string"
            ? {
                tanggal: (rawAttendance as Record<string, unknown>).tanggal as string,
                status:
                  (rawAttendance as Record<string, unknown>).status === "HADIR" ||
                  (rawAttendance as Record<string, unknown>).status === "IZIN" ||
                  (rawAttendance as Record<string, unknown>).status === "SAKIT" ||
                  (rawAttendance as Record<string, unknown>).status === "ALPA"
                    ? ((rawAttendance as Record<string, unknown>).status as StudentTodayAttendance["status"])
                    : null,
                keterangan: typeof (rawAttendance as Record<string, unknown>).keterangan === "string" ? ((rawAttendance as Record<string, unknown>).keterangan as string) : null,
                waktuHadir: typeof (rawAttendance as Record<string, unknown>).waktuHadir === "string" ? ((rawAttendance as Record<string, unknown>).waktuHadir as string) : null,
              }
            : null;
        const nextSession: Session = {
          nama: data.nama,
          peran: data.peran,
          wajibGantiPassword: data.wajibGantiPassword,
          sekolah: typeof raw.sekolah === "string" ? raw.sekolah : undefined,
          slug: typeof raw.slug === "string" ? raw.slug : undefined,
          plan: resolvePlanSlug(typeof raw.plan === "string" ? raw.plan : undefined),
          expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null,
          email: typeof raw.email === "string" ? raw.email : null,
          nuptk: typeof raw.nuptk === "string" ? raw.nuptk : null,
          telepon: typeof raw.telepon === "string" ? raw.telepon : null,
          mapelUtama: typeof raw.mapelUtama === "string" ? raw.mapelUtama : null,
          nisn: typeof raw.nisn === "string" ? raw.nisn : null,
          kelasId: typeof raw.kelasId === "string" ? raw.kelasId : null,
          kelasNama: typeof raw.kelasNama === "string" ? raw.kelasNama : null,
          presensiHariIni,
        };
        setSession(nextSession);
        saveAuthCache<LmsAuthCache>("lms", {
          token: initialCache?.token,
          nama: nextSession.nama,
          peran: nextSession.peran,
          wajibGantiPassword: nextSession.wajibGantiPassword,
          expiresAt: nextSession.expiresAt ?? null,
          updatedAt: Date.now(),
        });
        setStatus("ready");
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          if (!initialCache) {
            setError(describeFetchError(failure, "Layanan sesi LMS tidak tersedia."));
            setStatus("error");
          } else {
            setError(describeFetchError(failure, "Koneksi ke server LMS lambat."));
          }
        }
      });
    return () => controller.abort();
  }, []);

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await post("/api/auth/lms/logout");
      clearAuthCache("lms");
      navigate("/lms/login", { replace: true });
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal keluar. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  if (status === "unauthorized") return <Navigate to="/lms/login" replace />;
  if (status === "blocked") {
    return (
      <main className="glass-shell flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md rounded-3xl p-7 text-slate-900">
          <h1 className="text-2xl font-bold">Masa Uji Coba 14 Hari Berakhir</h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">{blockedMessage}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/lms/login" className="master-primary rounded-xl px-4 py-2.5 text-xs font-bold">
              Kembali ke Login LMS
            </Link>
            <Link to="/" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700">
              Beranda
            </Link>
          </div>
        </div>
      </main>
    );
  }
  if (status === "loading") return <PortalSpinner label="Memuat portal LMS" />;
  if (status !== "ready" || !session) return <main className="min-h-screen bg-slate-950 p-8 text-white">{error || "Layanan sesi tidak tersedia. Muat ulang halaman."}</main>;
  return (
    <TenantThemeProvider scope="lms" plan={session.plan}>
      {session.peran === "GURU" && !session.wajibGantiPassword ? (
        <TeacherPortal
          nama={session.nama}
          school={session.sekolah}
          plan={session.plan ?? "basic"}
          email={session.email}
          nuptk={session.nuptk}
          telepon={session.telepon}
          mapelUtama={session.mapelUtama}
          busy={busy}
          error={error}
          onLogout={logout}
          onPasswordChanged={() => {
            clearAuthCache("lms");
            navigate("/lms/login", { state: { changed: true }, replace: true });
          }}
          onProfileUpdated={(nextNama) => {
            setSession((prev) => (prev ? { ...prev, nama: nextNama } : prev));
          }}
        />
      ) : session.peran === "SISWA" && !session.wajibGantiPassword ? (
        <StudentPortal
          nama={session.nama}
          nisn={session.nisn}
          kelasId={session.kelasId}
          kelasNama={session.kelasNama}
          school={session.sekolah}
          presensiHariIni={session.presensiHariIni}
          busy={busy}
          error={error}
          onLogout={logout}
          onPasswordChanged={() => {
            clearAuthCache("lms");
            navigate("/lms/login", { state: { changed: true }, replace: true });
          }}
        />
      ) : (
        <LmsPortalShell
          session={session}
          activeNav={activeNav}
          setActiveNav={setActiveNav}
          busy={busy}
          error={error}
          onLogout={logout}
          onPasswordChanged={() => {
            clearAuthCache("lms");
            navigate("/lms/login", { state: { changed: true }, replace: true });
          }}
        />
      )}
    </TenantThemeProvider>
  );
}

function LmsPortalShell({
  session,
  activeNav,
  setActiveNav,
  busy,
  error,
  onLogout,
  onPasswordChanged,
}: {
  session: Session;
  activeNav: string;
  setActiveNav: (id: string) => void;
  busy: boolean;
  error: string;
  onLogout: () => void;
  onPasswordChanged: () => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const schoolDisplay = session.sekolah || "Lembaga PKBM";
  const userInitials = session.nama
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || session.nama.charAt(0).toUpperCase();
  return (
    <main className="dashboard-canvas glass-area min-h-screen text-slate-800">
      <header id="profil-lms" className="dashboard-header sticky top-0 z-30 border-b px-5 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <BrandLogo alt={`Logo ${schoolDisplay}`} className="h-10 w-10 rounded-xl border border-white/20" />
          <div className="min-w-0 flex-1">
            <h1 className={`truncate font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>{schoolDisplay}</h1>
            <p className={`text-xs font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
              {session.peran === "GURU" ? "Mode Guru" : "Mode Siswa"}
            </p>
          </div>
          <a
            href={session.peran === "SISWA" && !session.wajibGantiPassword ? "#biodata-dapodik" : "#profil-lms"}
            onClick={() => setActiveNav(session.peran === "SISWA" ? "biodata" : "profil")}
            title={session.peran === "SISWA" ? "Profil & Biodata Siswa" : "Profil Guru"}
            className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1 pl-3 pr-1 transition ${
              isDark
                ? "border-slate-700/80 bg-slate-800/80 hover:border-amber-400/50"
                : "border-slate-200/90 bg-white/90 hover:border-indigo-200 hover:bg-indigo-50/50"
            }`}
          >
            <div className="hidden min-w-0 text-right sm:block">
              <p className={`max-w-[160px] truncate text-xs font-bold leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                {session.nama}
              </p>
              <p className={`inline-flex items-center justify-end gap-1 text-[10px] font-semibold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                <UserRound size={10} aria-hidden="true" />
                {session.peran === "GURU" ? "Profil Guru" : "Profil Siswa"}
              </p>
            </div>
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black shadow-sm ${
                isDark
                  ? "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950"
                  : "bg-gradient-to-br from-indigo-500 to-cyan-500 text-white"
              }`}
            >
              {userInitials}
            </span>
          </a>
          <button
            disabled={busy}
            type="button"
            onClick={onLogout}
            className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition disabled:opacity-50 sm:text-sm ${
              isDark
                ? "border-slate-700/80 bg-slate-800/80 text-slate-200 hover:border-amber-400/50 hover:text-amber-300"
                : "rounded-xl border-indigo-200 bg-white/90 text-indigo-700 backdrop-blur-md hover:bg-white"
            }`}
          >
            Keluar
          </button>
        </div>
      </header>
      <div className="animate-page-enter mx-auto max-w-6xl space-y-5 px-4 py-6 pb-28 sm:px-6 md:pb-6">
        <div id="beranda-lms" className="scroll-mt-24 space-y-3">
          <DashboardHero
            title={session.wajibGantiPassword ? "Wajib ganti password" : `Selamat datang, ${session.nama}`}
            description={session.wajibGantiPassword ? "Buat password baru untuk melanjutkan." : "Akses jadwal dan kegiatan pembelajaran Anda."}
            badge={session.peran === "GURU" ? "Portal Guru" : "Portal Siswa"}
          />
          {session.peran === "SISWA" && !session.wajibGantiPassword && session.presensiHariIni && (
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const st = session.presensiHariIni.status;
                const ket = session.presensiHariIni.keterangan;
                if (st === "HADIR") {
                  const sourceLabel = ket === "Login Daring" ? "Login Daring" : ket || "Dicatat Guru";
                  return (
                    <span
                      role="status"
                      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-xs ${
                        isDark
                          ? "border-emerald-500/40 bg-emerald-950/60 text-emerald-200"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900"
                      }`}
                    >
                      <CheckCircle2 size={15} className="shrink-0 text-emerald-600" aria-hidden="true" />
                      Presensi Hari Ini: Tercatat Hadir ({sourceLabel})
                    </span>
                  );
                }
                if (st === "IZIN" || st === "SAKIT" || st === "ALPA") {
                  const labelMap = { IZIN: "Izin", SAKIT: "Sakit", ALPA: "Alpa" } as const;
                  const tone =
                    st === "IZIN"
                      ? isDark
                        ? "border-sky-500/40 bg-sky-950/60 text-sky-200"
                        : "border-sky-300 bg-sky-50 text-sky-900"
                      : st === "SAKIT"
                        ? isDark
                          ? "border-amber-500/40 bg-amber-950/60 text-amber-200"
                          : "border-amber-300 bg-amber-50 text-amber-900"
                        : isDark
                          ? "border-rose-500/40 bg-rose-950/60 text-rose-200"
                          : "border-rose-300 bg-rose-50 text-rose-900";
                  return (
                    <span role="status" className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-xs ${tone}`}>
                      <CheckCircle2 size={15} className="shrink-0" aria-hidden="true" />
                      Presensi Hari Ini: Tercatat {labelMap[st]} (Dicatat Guru)
                    </span>
                  );
                }
                return (
                  <span
                    role="status"
                    className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold ${
                      isDark
                        ? "border-slate-700 bg-slate-900/70 text-slate-300"
                        : "border-slate-200 bg-white/90 text-slate-600"
                    }`}
                  >
                    Presensi Hari Ini: Menunggu Penempatan Kelas
                  </span>
                );
              })()}
            </div>
          )}
        </div>
        {session.wajibGantiPassword ? (
          <div className="dashboard-glass p-5">
            <PasswordChangeForm
              endpoint="/api/auth/lms/ganti-password"
              requireCurrentPassword={false}
              title="Buat password baru"
              description="Password baru minimal 6 karakter dan berbeda dari password awal. Setelah disimpan, masuk kembali."
              onChanged={onPasswordChanged}
              buttonClassName={button}
            />
          </div>
        ) : (
          <>
            <nav aria-label="Navigasi pembelajaran" className="dashboard-glass flex flex-wrap gap-2 p-3">
              <a
                href="#jadwal-lms"
                onClick={() => setActiveNav("jadwal")}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  isDark
                    ? activeNav === "jadwal"
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                      : "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:text-white"
                    : "bg-indigo-50 text-indigo-700"
                }`}
              >
                Jadwal
              </a>
              <a
                href="#pembelajaran-lms"
                onClick={() => setActiveNav("materi")}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  isDark
                    ? activeNav === "materi"
                      ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                      : "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:text-white"
                    : "bg-cyan-50 text-cyan-800"
                }`}
              >
                Ruang KBM
              </a>
              {session.peran === "SISWA" && (
                <a
                  href="#biodata-dapodik"
                  onClick={() => setActiveNav("biodata")}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    isDark
                      ? activeNav === "biodata"
                        ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                        : "border border-emerald-500/35 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20"
                      : "bg-emerald-50 text-emerald-800"
                  }`}
                >
                  Lengkapi Berkas Dapodik
                </a>
              )}
              {session.peran === "GURU" && (
                <a
                  href="#akses-lms"
                  onClick={() => setActiveNav("profil")}
                  className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                    isDark
                      ? activeNav === "profil"
                        ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                        : "border border-slate-700/70 bg-slate-800/70 text-slate-300 hover:text-white"
                      : "bg-violet-50 text-violet-700"
                  }`}
                >
                  Pengaturan akses
                </a>
              )}
            </nav>
            <div id="jadwal-lms" className="scroll-mt-24">
              <LmsSchedule role={session.peran} />
            </div>
            <div id="pembelajaran-lms" className="scroll-mt-24">
              <Classroom role={session.peran} />
            </div>
            {session.peran === "SISWA" && (
              <div id="biodata-dapodik" className="scroll-mt-24">
                <StudentVervalForm />
              </div>
            )}
          </>
        )}
        {!session.wajibGantiPassword && session.peran === "GURU" && (
          <div id="akses-lms" className="dashboard-glass scroll-mt-24 p-5">
            <PasswordChangeForm endpoint="/api/auth/lms/ganti-password" onChanged={onPasswordChanged} />
            <TeacherPasswordReset />
          </div>
        )}
        {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
      </div>
      {!session.wajibGantiPassword && (
        <nav
          aria-label="Navigasi bawah pembelajaran"
          className={
            isDark
              ? "fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md justify-around gap-1 rounded-full border border-slate-700/60 bg-slate-900/90 px-2 py-1.5 shadow-[0_14px_40px_rgba(2,6,23,0.75)] backdrop-blur-2xl md:hidden"
              : "fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-white/85 bg-white/90 px-1 pt-2 shadow-[0_-8px_30px_rgba(15,76,129,0.08)] backdrop-blur-xl md:hidden"
          }
          style={isDark ? undefined : { paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {[
            { id: "beranda", label: "Beranda", href: "#beranda-lms", icon: Home },
            { id: "jadwal", label: "Jadwal", href: "#jadwal-lms", icon: CalendarDays },
            { id: "materi", label: "Ruang KBM", href: "#pembelajaran-lms", icon: BookOpen },
            { id: session.peran === "GURU" ? "profil" : "biodata", label: session.peran === "GURU" ? "Akses" : "Berkas Dapodik", href: session.peran === "GURU" ? "#akses-lms" : "#biodata-dapodik", icon: UserRound },
          ].map(({ id, label, href, icon: Icon }) =>
            isDark ? (
              <a
                key={id}
                href={href}
                onClick={() => setActiveNav(id)}
                aria-current={activeNav === id ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-2 py-1.5 text-[10px] transition ${
                  activeNav === id
                    ? "bg-gradient-to-r from-amber-400 to-amber-500 font-extrabold text-slate-950 shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                    : "font-medium text-slate-400 hover:text-white"
                }`}
              >
                <Icon size={17} />
                <span className="truncate">{label}</span>
              </a>
            ) : (
              <a
                key={id}
                href={href}
                onClick={() => setActiveNav(id)}
                aria-current={activeNav === id ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1 text-[10px] ${
                  activeNav === id ? "font-semibold text-indigo-600" : "font-medium text-slate-600"
                }`}
              >
                <span className={`rounded-xl p-1.5 ${activeNav === id ? "bg-indigo-50/80" : ""}`}>
                  <Icon size={20} />
                </span>
                {label}
              </a>
            ),
          )}
        </nav>
      )}
    </main>
  );
}
