import type { ReactNode } from "react";
import { GraduationCap, Inbox } from "lucide-react";

export function PortalSpinner({ label = "Memuat portal..." }: { label?: string }) {
  return (
    <main
      role="status"
      aria-live="polite"
      aria-label={label}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-72 w-72 rounded-full bg-indigo-500/20 blur-3xl animate-pulse"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-56 w-56 translate-x-12 -translate-y-10 rounded-full bg-cyan-500/15 blur-3xl animate-pulse"
      />
      <div className="relative flex items-center justify-center">
        <div
          aria-hidden="true"
          className="h-20 w-20 rounded-full bg-gradient-to-tr from-indigo-500 via-cyan-400 to-violet-500 p-[3px] animate-spin"
          style={{ animationDuration: "1.1s" }}
        >
          <div className="h-full w-full rounded-full bg-slate-950" />
        </div>
        <div
          aria-hidden="true"
          className="absolute flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-slate-900/90 text-indigo-300 shadow-lg backdrop-blur-xl animate-pulse"
        >
          <GraduationCap size={22} />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </main>
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div
      role="status"
      aria-label="Menyiapkan data tabel"
      className="dashboard-glass mt-5 overflow-hidden rounded-2xl p-4"
    >
      <div className="space-y-3">
        <div className="grid gap-3 border-b border-slate-200/60 pb-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((_, index) => (
            <div key={index} className="h-3.5 rounded-md bg-slate-300/60 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid items-center gap-3 py-2"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((__, colIndex) => (
              <div
                key={colIndex}
                className={`h-4 rounded-lg bg-slate-200/75 animate-pulse ${colIndex === 0 ? "w-4/5" : "w-3/5"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Menyiapkan data...</span>
    </div>
  );
}

export function CardGridSkeleton({ count = 4, columns = 4 }: { count?: number; columns?: 2 | 3 | 4 }) {
  const gridClass =
    columns === 2
      ? "sm:grid-cols-2"
      : columns === 3
        ? "md:grid-cols-2 xl:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return (
    <div role="status" aria-label="Menyiapkan tampilan kartu" className={`mt-5 grid grid-cols-1 gap-4 ${gridClass}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="dashboard-glass rounded-2xl p-5 space-y-3"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="h-3.5 w-2/5 rounded-md bg-slate-300/65 animate-pulse" />
            <div className="h-9 w-9 rounded-xl bg-slate-200/75 animate-pulse" />
          </div>
          <div className="h-7 w-1/2 rounded-lg bg-slate-300/70 animate-pulse" />
          <div className="h-3 w-3/4 rounded-md bg-slate-200/65 animate-pulse" />
        </div>
      ))}
      <span className="sr-only">Menyiapkan tampilan...</span>
    </div>
  );
}

export function DashboardHero({
  title,
  description,
  eyebrow,
  badge,
  action,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  badge?: string;
  action?: ReactNode;
}) {
  return (
    <div className="dashboard-hero rounded-2xl p-6 sm:p-7">
      <div className="relative z-10 min-w-0">
        {eyebrow && (
          <span className="mb-3 inline-flex rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white backdrop-blur-md">
            {eyebrow}
          </span>
        )}
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-blue-50/95">{description}</p>
        {badge && (
          <span className="mt-4 inline-flex rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">
            {badge}
          </span>
        )}
      </div>
      {action && <div className="relative z-10 shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="dashboard-glass mt-5 border-dashed px-5 py-8 text-center">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-600"><Inbox size={25} /></span>
    <p className="mt-3 font-bold text-slate-800">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}
