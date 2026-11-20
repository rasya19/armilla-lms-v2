import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import { TableSkeleton } from "./DashboardUI";
import { getCached, invalidateCache, setCached } from "./schoolCache";

type School = {
  id: string;
  nama: string;
  slug: string;
  npsn: string | null;
  plan?: PlanSlug;
  status?: string;
};
type SchoolPage = { sekolah: School[]; page: number; hasNext: boolean };
type ToastState = { kind: "success" | "error"; text: string } | null;

const PLAN_OPTIONS: Array<{ value: PlanSlug; label: string }> = [
  { value: "basic", label: "Paket Basic" },
  { value: "reguler", label: "Paket Reguler" },
  { value: "pro", label: "Paket Pro" },
];

function isSchoolPage(data: unknown): data is SchoolPage {
  if (
    typeof data !== "object" ||
    data === null ||
    !("sekolah" in data) ||
    !Array.isArray(data.sekolah) ||
    !("page" in data) ||
    typeof data.page !== "number" ||
    !("hasNext" in data) ||
    typeof data.hasNext !== "boolean"
  ) {
    return false;
  }
  return data.sekolah.every(
    (school: unknown) =>
      typeof school === "object" &&
      school !== null &&
      "id" in school &&
      typeof school.id === "string" &&
      "nama" in school &&
      typeof school.nama === "string" &&
      "slug" in school &&
      typeof school.slug === "string" &&
      "npsn" in school &&
      (school.npsn === null || typeof school.npsn === "string")
  );
}

export function MasterSchools() {
  const [page, setPage] = useState(1);
  const endpoint = `/api/master/sekolah?page=${page}`;
  const [result, setResult] = useState<SchoolPage | null>(() => getCached<SchoolPage>(endpoint));
  const [selectedPlans, setSelectedPlans] = useState<Record<string, PlanSlug>>(() => {
    const cached = getCached<SchoolPage>(endpoint);
    if (!cached) return {};
    const next: Record<string, PlanSlug> = {};
    for (const school of cached.sekolah) {
      next[school.id] = resolvePlanSlug(school.plan);
    }
    return next;
  });
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();
    const cached = getCached<SchoolPage>(endpoint);
    if (cached) {
      setResult(cached);
    } else {
      setResult(null);
    }
    setError("");
    fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Sesi berakhir. Silakan masuk kembali."
              : "Daftar sekolah tidak tersedia. Coba lagi nanti."
          );
        }
        const data: unknown = await response.json();
        if (!isSchoolPage(data) || data.page !== page) {
          throw new Error("Respons daftar sekolah tidak valid.");
        }
        setCached(endpoint, data);
        setResult(data);
        setSelectedPlans((previous) => {
          const next = { ...previous };
          for (const school of data.sekolah) {
            next[school.id] = resolvePlanSlug(school.plan);
          }
          return next;
        });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted && !cached) {
          console.error("Gagal memuat daftar sekolah:", failure);
          setError(failure instanceof Error ? failure.message : "Daftar sekolah tidak tersedia.");
        }
      });
    return () => controller.abort();
  }, [endpoint, page]);

  async function syncPlanToLms(school: School, nextPlan: PlanSlug) {
    const cleanPlan = resolvePlanSlug(nextPlan);
    setSelectedPlans((previous) => ({ ...previous, [school.id]: cleanPlan }));
    setSyncingId(school.id);
    setToast(null);
    try {
      const response = await fetch(`/api/master/sekolah/${encodeURIComponent(school.id)}/paket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: cleanPlan,
          paket: cleanPlan,
          npsn: school.npsn,
          slug: school.slug,
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      const bodyObj =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : null;

      if (!response.ok) {
        const message =
          (bodyObj && typeof bodyObj.error === "string" && bodyObj.error) ||
          (bodyObj && typeof bodyObj.message === "string" && bodyObj.message) ||
          `Sinkronisasi paket ke LMS gagal (status ${response.status}).`;
        throw new Error(message);
      }

      const planLabel = PLAN_OPTIONS.find((item) => item.value === cleanPlan)?.label ?? cleanPlan;
      const successMessage =
        (bodyObj && typeof bodyObj.message === "string" && bodyObj.message) ||
        `Paket ${school.nama} berhasil disinkronkan ke LMS (${planLabel}).`;

      invalidateCache(["/api/master/sekolah", "/api/master/overview"]);
      setResult((previous) =>
        previous
          ? {
              ...previous,
              sekolah: previous.sekolah.map((item) =>
                item.id === school.id ? { ...item, plan: cleanPlan } : item
              ),
            }
          : previous
      );
      setToast({ kind: "success", text: successMessage });
    } catch (failure: unknown) {
      console.error("Gagal sinkronisasi paket ke LMS:", failure);
      setToast({
        kind: "error",
        text:
          failure instanceof Error
            ? failure.message
            : "Gagal menyinkronkan paket ke server LMS.",
      });
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <section className="master-section p-6 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Kelola Tenant</h2>
          <p className="mt-1 text-sm text-slate-600">
            Atur paket langganan tenant dan sinkronkan langsung ke server LMS (<code className="font-mono text-xs text-indigo-800">pkbm.siput.id</code>).
          </p>
        </div>
      </div>

      {toast && (
        <div
          role={toast.kind === "error" ? "alert" : "status"}
          className={`fixed bottom-24 right-4 z-50 flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm shadow-2xl md:bottom-6 ${
            toast.kind === "success"
              ? "border-emerald-300 bg-emerald-700 text-white"
              : "border-rose-300 bg-rose-700 text-white"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <p className="flex-1 font-semibold leading-5">{toast.text}</p>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Tutup notifikasi"
            className="rounded-lg p-1 text-white/90 hover:bg-white/15"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-5 text-sm text-rose-700">
          {error}
        </p>
      ) : !result ? (
        <TableSkeleton rows={5} columns={5} />
      ) : (
        <>
          {result.sekolah.length === 0 ? (
            <p className="mt-5 text-sm text-slate-600">Tidak ada sekolah pada halaman ini.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="master-schools-table w-full text-left text-sm">
                <thead className="border-b border-[#e6dfd0] text-slate-600">
                  <tr>
                    <th className="py-3 pr-4">Nama sekolah</th>
                    <th className="py-3 pr-4">Slug</th>
                    <th className="py-3 pr-4">NPSN</th>
                    <th className="py-3 pr-4">Paket Langganan</th>
                    <th className="py-3">Sinkronisasi LMS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sekolah.map((school) => {
                    const currentPlan = selectedPlans[school.id] ?? resolvePlanSlug(school.plan);
                    const busy = syncingId === school.id;
                    return (
                      <tr key={school.id} className="border-b border-[#e6dfd0]">
                        <td data-label="Nama sekolah" className="py-3 pr-4 font-semibold">
                          {school.nama}
                        </td>
                        <td data-label="Slug" className="py-3 pr-4 font-mono text-xs text-slate-700">
                          {school.slug}
                        </td>
                        <td data-label="NPSN" className="py-3 pr-4">
                          {school.npsn ?? "Belum diisi"}
                        </td>
                        <td data-label="Paket Langganan" className="py-3 pr-4">
                          <label className="sr-only" htmlFor={`plan-select-${school.id}`}>
                            Pilih paket untuk {school.nama}
                          </label>
                          <select
                            id={`plan-select-${school.id}`}
                            disabled={syncingId !== null}
                            value={currentPlan}
                            onChange={(event) => {
                              const nextPlan = resolvePlanSlug(event.target.value);
                              void syncPlanToLms(school, nextPlan);
                            }}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 disabled:opacity-50"
                          >
                            {PLAN_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td data-label="Sinkronisasi LMS" className="py-3">
                          <button
                            type="button"
                            disabled={syncingId !== null}
                            onClick={() => void syncPlanToLms(school, currentPlan)}
                            className="master-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            ) : (
                              <RefreshCw size={14} aria-hidden="true" />
                            )}
                            {busy ? "Menyinkronkan..." : "Paket LMS"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-5 flex items-center gap-4 text-sm">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
              className="font-bold text-[#80643a] disabled:text-slate-400"
            >
              Sebelumnya
            </button>
            <span>Halaman {page}</span>
            <button
              type="button"
              disabled={!result.hasNext}
              onClick={() => setPage((value) => value + 1)}
              className="font-bold text-[#80643a] disabled:text-slate-400"
            >
              Berikutnya
            </button>
          </div>
        </>
      )}
    </section>
  );
}
