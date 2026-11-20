import { useState } from "react";
import { ChevronDown, ChevronUp, Eye, GraduationCap, ShieldAlert, Terminal, UserCheck, Users } from "lucide-react";
import { Classroom } from "./Classroom";
import { CardGridSkeleton, DashboardHero, EmptyState } from "./DashboardUI";
import { LmsSchedule } from "./LmsSchedule";
import type { PlanSlug } from "./subscriptionPlans";

export type SandboxMode = "client" | "dev";
export type SandboxRole = "ADMIN" | "GURU" | "SISWA";

export type SandboxSamples = {
  guru: { id: string; nama: string; email: string } | null;
  siswa: { id: string; nama: string; nisn: string; kelasId: string | null } | null;
};

export function DevSandboxToolbar({
  slug,
  plan,
  mode,
  role,
  samples,
  samplesLoading,
  onModeChange,
  onRoleChange,
}: {
  slug: string;
  plan: PlanSlug;
  mode: SandboxMode;
  role: SandboxRole;
  samples: SandboxSamples | null;
  samplesLoading: boolean;
  onModeChange: (next: SandboxMode) => void;
  onRoleChange: (next: SandboxRole) => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const roleLabel = role === "ADMIN" ? "Admin Lembaga" : role === "GURU" ? "Guru" : "Siswa";

  if (minimized) {
    return (
      <div className="fixed bottom-20 right-4 z-50 md:bottom-5">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="flex items-center gap-2 rounded-2xl border border-indigo-400/40 bg-slate-900/90 px-3.5 py-2 text-xs font-extrabold text-white shadow-2xl backdrop-blur-xl transition hover:border-indigo-300/70"
        >
          <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          <span>DEV SANDBOX</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cyan-200">
            {mode === "dev" ? "DEV" : "CLIENT"} · {role}
          </span>
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Dev Sandbox Toolbar"
      className="fixed bottom-20 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-indigo-400/35 bg-slate-950/92 p-3.5 text-slate-100 shadow-[0_20px_50px_rgba(2,6,23,0.55)] backdrop-blur-2xl md:bottom-5"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 text-white">
            <Terminal size={13} aria-hidden="true" />
          </span>
          <span className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300">
            DEV SANDBOX
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label="Minimize Dev Sandbox Toolbar"
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sakelar Mode Tampilan</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-900/90 p-1">
            <button
              type="button"
              aria-pressed={mode === "client"}
              onClick={() => onModeChange("client")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                mode === "client"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Eye size={12} aria-hidden="true" />
              Client View
            </button>
            <button
              type="button"
              aria-pressed={mode === "dev"}
              onClick={() => onModeChange("dev")}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition ${
                mode === "dev"
                  ? "bg-amber-500 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <ShieldAlert size={12} aria-hidden="true" />
              Dev View
            </button>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role Switcher Cepat</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {([
              { id: "ADMIN" as const, label: "Admin", icon: UserCheck },
              { id: "GURU" as const, label: "Guru", icon: GraduationCap },
              { id: "SISWA" as const, label: "Siswa", icon: Users },
            ]).map(({ id, label, icon: Icon }) => {
              const active = role === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onRoleChange(id)}
                  className={`flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                    active
                      ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                      : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <Icon size={12} aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          {role !== "ADMIN" && (
            <p className="mt-1.5 truncate text-[10px] text-cyan-200/90">
              {samplesLoading
                ? "Memuat sampel tenant..."
                : role === "GURU"
                  ? samples?.guru
                    ? `Sampel: ${samples.guru.nama}`
                    : "Belum ada data guru aktif di tenant ini"
                  : samples?.siswa
                    ? `Sampel: ${samples.siswa.nama}`
                    : "Belum ada data siswa aktif di tenant ini"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-2 text-[10px]">
          <span className="truncate font-mono font-semibold text-slate-300">
            {slug} · <span className="uppercase text-amber-300">{plan}</span>
          </span>
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 font-extrabold text-indigo-200">{roleLabel}</span>
        </div>
      </div>
    </aside>
  );
}

export function DevSandboxLmsPreview({
  role,
  school,
  samples,
  loading,
  onBackToAdmin,
}: {
  role: "GURU" | "SISWA";
  school: string;
  samples: SandboxSamples | null;
  loading: boolean;
  onBackToAdmin: () => void;
}) {
  const sampleUser = role === "GURU" ? samples?.guru : samples?.siswa;

  return (
    <div className="min-h-screen">
      <header className="dashboard-header sticky top-0 z-30 border-b px-5 py-3">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 font-bold text-white">
            {(sampleUser?.nama ?? role).charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-bold text-slate-900">
              {sampleUser ? sampleUser.nama : role === "GURU" ? "Pratinjau Portal Guru" : "Pratinjau Portal Siswa"}
            </h1>
            <p className="text-xs font-semibold text-indigo-700">
              {role === "GURU" ? "Guru" : "Siswa"} · {school} (Sandbox Preview)
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="rounded-xl border border-indigo-200 bg-white/80 px-4 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50"
          >
            Kembali ke Admin
          </button>
        </div>
      </header>

      <div className="animate-page-enter mx-auto max-w-6xl space-y-6 px-4 py-6 pb-36 sm:px-6 md:pb-24">
        <DashboardHero
          eyebrow={`SANDBOX PRATINJAU ${role}`}
          title={`Selamat datang, ${sampleUser?.nama ?? (role === "GURU" ? "Tutor PKBM" : "Warga Belajar")}`}
          description="Pratinjau langsung tampilan jadwal, ruang belajar, materi, dan tugas menggunakan data asli tenant aktif."
          badge={role === "GURU" ? "Portal Guru" : "Portal Siswa"}
        />

        {loading ? (
          <CardGridSkeleton count={3} columns={3} />
        ) : !sampleUser ? (
          <EmptyState
            title={`Belum ada data ${role === "GURU" ? "guru" : "siswa"} aktif`}
            description={`Tambahkan minimal satu ${role === "GURU" ? "guru" : "siswa"} aktif pada tenant ${school} untuk mencoba pratinjau portal ${role.toLowerCase()}.`}
            action={
              <button type="button" onClick={onBackToAdmin} className="master-primary px-4 py-2">
                Kembali ke Admin Lembaga
              </button>
            }
          />
        ) : (
          <>
            <nav aria-label="Navigasi pratinjau LMS" className="dashboard-glass flex flex-wrap gap-2 rounded-2xl p-3">
              <a href="#sandbox-jadwal" className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700">
                Jadwal
              </a>
              <a href="#sandbox-ruang-kbm" className="rounded-full bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-800">
                Ruang KBM
              </a>
            </nav>
            <div id="sandbox-jadwal" className="scroll-mt-24">
              <LmsSchedule role={role} sandboxRole={role} />
            </div>
            <div id="sandbox-ruang-kbm" className="scroll-mt-24">
              <Classroom role={role} sandboxRole={role} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
