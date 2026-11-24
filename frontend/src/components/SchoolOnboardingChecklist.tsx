import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, Circle, Rocket, Sparkles, Users, X } from "lucide-react";
import { useTenantTheme } from "./TenantThemeProvider";

export function SchoolOnboardingChecklist({
  slug,
  hasStudents,
  hasTeachers,
  hasClasses,
  onNavigate,
}: {
  slug: string;
  hasStudents: boolean;
  hasTeachers: boolean;
  hasClasses: boolean;
  onNavigate: (view: string) => void;
}) {
  const isDark = useTenantTheme() === "dark";
  const storageKey = `onboarding:dismissed:${slug}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const steps = [
    {
      id: "profil",
      title: "Lengkapi Profil & Logo Lembaga",
      desc: "Atur kop surat, NPSN, kepala sekolah, dan logo untuk E-Raport & Transkrip Ijazah.",
      done: hasClasses,
      actionLabel: "Buka Pengaturan",
      targetView: "pengaturan-profil",
      icon: Rocket,
    },
    {
      id: "data",
      title: "Tambah / Impor Siswa & Guru",
      desc: "Impor warga belajar dari Excel Dapodik dan buat akun login tutor serta siswa.",
      done: hasStudents && hasTeachers,
      actionLabel: "Kelola Siswa",
      targetView: "siswa",
      icon: Users,
    },
    {
      id: "modul",
      title: "Aktifkan 27 E-Modul Nasional",
      desc: "Klik Isi Katalog Nasional di Bank Modul agar materi Paket A, B, C langsung siap dipakai.",
      done: false,
      actionLabel: "Buka Bank Modul",
      targetView: "bank-modul",
      icon: BookOpen,
    },
    {
      id: "cbt",
      title: "Buat / Generate Soal Ujian AI",
      desc: "Coba susun soal UTS, UAS, atau Ujian Akhir/UPK otomatis menggunakan Gemini AI.",
      done: false,
      actionLabel: "Buka CBT AI",
      targetView: "cbt-bank-soal",
      icon: Sparkles,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const pct = Math.round((completedCount / steps.length) * 100);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(storageKey, "1");
    } catch {
      // ignore storage errors
    }
  }

  return (
    <div
      className={`rounded-2xl border p-5 shadow-xs ${
        isDark
          ? "border-indigo-500/30 bg-gradient-to-br from-slate-900/90 via-indigo-950/40 to-slate-900/90 text-slate-100"
          : "border-indigo-200/90 bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/80 text-slate-900"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
              <Rocket size={11} aria-hidden="true" /> Panduan Mulai Cepat
            </span>
            <span className={`text-xs font-bold ${isDark ? "text-indigo-300" : "text-indigo-700"}`}>
              {completedCount}/{steps.length} langkah selesai
            </span>
          </div>
          <h3 className="mt-1.5 text-base font-extrabold">
            Siapkan Portal LMS Lembaga Anda dalam 4 Langkah
          </h3>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          title="Sembunyikan panduan mulai cepat"
          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
            isDark ? "text-slate-400 hover:bg-slate-800 hover:text-white" : "text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
          }`}
        >
          <X size={14} /> Sembunyikan
        </button>
      </div>

      <div className={`mt-3 h-2 w-full overflow-hidden rounded-full ${isDark ? "bg-slate-800" : "bg-indigo-100"}`}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-300"
          style={{ width: `${Math.max(12, pct)}%` }}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onNavigate(step.targetView)}
              className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition hover:-translate-y-0.5 ${
                step.done
                  ? isDark
                    ? "border-emerald-500/35 bg-emerald-950/25"
                    : "border-emerald-200 bg-emerald-50/60"
                  : isDark
                    ? "border-slate-700/70 bg-slate-950/60 hover:border-indigo-400/50"
                    : "border-slate-200 bg-white/95 hover:border-indigo-300 hover:shadow-xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      step.done
                        ? "bg-emerald-100 text-emerald-700"
                        : isDark
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "bg-indigo-100 text-indigo-700"
                    }`}
                  >
                    <Icon size={14} />
                  </span>
                  {step.done ? (
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  ) : (
                    <Circle size={15} className={isDark ? "text-slate-600" : "text-slate-300"} />
                  )}
                </div>
                <p className="mt-2.5 text-xs font-extrabold">{step.title}</p>
                <p className={`mt-1 text-[11px] leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  {step.desc}
                </p>
              </div>
              <span className={`mt-3 inline-flex items-center gap-1 text-[11px] font-extrabold ${isDark ? "text-amber-300" : "text-indigo-700"}`}>
                {step.actionLabel} <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
