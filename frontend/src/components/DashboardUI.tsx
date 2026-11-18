import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function DashboardHero({ title, description, badge, action }: { title: string; description: string; badge?: string; action?: ReactNode }) {
  return <div className="dashboard-hero">
    <div className="relative z-10 min-w-0">
      <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-50">{description}</p>
      {badge && <span className="mt-4 inline-flex rounded-full border border-white/30 bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur-md">{badge}</span>}
    </div>
    {action && <div className="relative z-10 shrink-0">{action}</div>}
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="dashboard-glass mt-5 border-dashed px-5 py-8 text-center">
    <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-600"><Inbox size={25} /></span>
    <p className="mt-3 font-bold text-slate-800">{title}</p><p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}
