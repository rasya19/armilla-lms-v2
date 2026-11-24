import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarClock, Check, CheckCircle2, Landmark, Loader2, MapPin, Palette, Plus, RefreshCw, ShieldAlert, X } from "lucide-react";
import { resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import { TableSkeleton } from "./DashboardUI";
import { getCached, invalidateCache, setCached } from "./schoolCache";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { dispatchTenantThemeChange, isThemeKey, type ThemeKey } from "./TenantThemeProvider";
import { formatDateInputValue, getTrialCountdown } from "./trialDates";

type School = {
  id: string;
  nama: string;
  slug: string;
  npsn: string | null;
  plan?: PlanSlug;
  status?: string;
  expiresAt?: string | null;
  kabupatenKota?: string | null;
  izinVervalDinas?: boolean;
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
  const [regionModalSchool, setRegionModalSchool] = useState<School | null>(null);
  const [regionKabupaten, setRegionKabupaten] = useState("");
  const [regionIzin, setRegionIzin] = useState(true);
  const [regionBusy, setRegionBusy] = useState(false);
  const [expiryModalSchool, setExpiryModalSchool] = useState<School | null>(null);
  const [expiryDateInput, setExpiryDateInput] = useState("");
  const [expiryStatusInput, setExpiryStatusInput] = useState<"ACTIVE" | "SUSPENDED">("ACTIVE");
  const [expiryBusy, setExpiryBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    nama: "",
    slug: "",
    npsn: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    plan: "pro" as PlanSlug,
    trial14Hari: true,
    isiKontenSiapPakai: true,
  });
  const [reloadTick, setReloadTick] = useState(0);
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
    fetchWithTimeout(endpoint, { signal: controller.signal })
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
        if (!isCallerAborted(failure, controller.signal) && !cached) {
          setError(describeFetchError(failure, "Daftar sekolah tidak tersedia."));
        }
      });
    return () => controller.abort();
  }, [endpoint, page, reloadTick]);

  async function syncPlanToLms(school: School, nextPlan: PlanSlug) {
    const cleanPlan = resolvePlanSlug(nextPlan);
    setSelectedPlans((previous) => ({ ...previous, [school.id]: cleanPlan }));
    setSyncingId(school.id);
    setToast(null);
    try {
      const response = await fetchWithTimeout(`/api/master/sekolah/${encodeURIComponent(school.id)}/paket`, {
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
      setToast({
        kind: "error",
        text: describeFetchError(failure, "Gagal menyinkronkan paket ke server LMS."),
      });
    } finally {
      setSyncingId(null);
    }
  }

  async function saveSchoolRegion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!regionModalSchool) return;
    setRegionBusy(true);
    setToast(null);
    try {
      const response = await fetchWithTimeout(`/api/master/sekolah/${encodeURIComponent(regionModalSchool.id)}/wilayah`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kabupatenKota: regionKabupaten.trim() || null,
          izinVervalDinas: regionIzin,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        sekolah?: { kabupatenKota: string | null; izinVervalDinas: boolean };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Gagal menyimpan wilayah verval Dinas PKBM.");
      }
      invalidateCache("/api/master/sekolah");
      setResult((previous) =>
        previous
          ? {
              ...previous,
              sekolah: previous.sekolah.map((item) =>
                item.id === regionModalSchool.id
                  ? {
                      ...item,
                      kabupatenKota: body?.sekolah?.kabupatenKota ?? (regionKabupaten.trim() || null),
                      izinVervalDinas: body?.sekolah?.izinVervalDinas ?? regionIzin,
                    }
                  : item,
              ),
            }
          : previous,
      );
      setToast({
        kind: "success",
        text: body?.message || `Wilayah verval Dinas ${regionModalSchool.nama} berhasil diperbarui.`,
      });
      setRegionModalSchool(null);
    } catch (failure: unknown) {
      setToast({
        kind: "error",
        text: describeFetchError(failure, "Gagal memperbarui wilayah sekolah."),
      });
    } finally {
      setRegionBusy(false);
    }
  }

  async function updateSchoolExpiry(
    school: School,
    payload: { mode: "trial14" | "extend14" | "unlimited" | "suspend" | "custom"; expiresAt?: string | null; status?: "ACTIVE" | "SUSPENDED" },
  ) {
    setExpiryBusy(true);
    setToast(null);
    try {
      const response = await fetchWithTimeout(`/api/master/sekolah/${encodeURIComponent(school.id)}/masa-aktif`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
        sekolah?: { status: string; expiresAt: string | null };
      } | null;
      if (!response.ok || !body?.sekolah) {
        throw new Error(body?.error || "Gagal memperbarui masa aktif tenant.");
      }
      invalidateCache("/api/master/sekolah");
      setResult((previous) =>
        previous
          ? {
              ...previous,
              sekolah: previous.sekolah.map((item) =>
                item.id === school.id
                  ? { ...item, status: body.sekolah!.status, expiresAt: body.sekolah!.expiresAt }
                  : item,
              ),
            }
          : previous,
      );
      setToast({ kind: "success", text: body.message || `Masa aktif ${school.nama} berhasil diperbarui.` });
      setExpiryModalSchool(null);
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal memperbarui masa aktif tenant.") });
    } finally {
      setExpiryBusy(false);
    }
  }

  async function createNewSchool(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateBusy(true);
    setToast(null);
    try {
      const response = await fetchWithTimeout("/api/master/sekolah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Gagal membuat tenant sekolah baru.");
      }
      invalidateCache(["/api/master/sekolah", "/api/master/overview"]);
      setToast({ kind: "success", text: body?.message || "Tenant sekolah baru berhasil dibuat." });
      setCreateOpen(false);
      setCreateForm({
        nama: "",
        slug: "",
        npsn: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        plan: "pro",
        trial14Hari: true,
        isiKontenSiapPakai: true,
      });
      setReloadTick((value) => value + 1);
    } catch (failure: unknown) {
      setToast({ kind: "error", text: describeFetchError(failure, "Gagal membuat tenant baru.") });
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <MasterGlobalThemePanel />
      <section className="master-section p-6 text-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Kelola Tenant</h2>
            <p className="mt-1 text-sm text-slate-600">
              Atur paket langganan, masa uji coba 14 hari (end date), dan sinkronisasi langsung ke server LMS (<code className="font-mono text-xs text-indigo-800">pkbm.siput.id</code>).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="master-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold"
          >
            <Plus size={15} aria-hidden="true" />
            Buat Tenant / Trial 14 Hari
          </button>
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
                    <th className="py-3 pr-4">Masa Aktif / End Date</th>
                    <th className="py-3 pr-4">Wilayah Dinas</th>
                    <th className="py-3 pr-4">Paket Langganan</th>
                    <th className="py-3">Sinkronisasi LMS</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sekolah.map((school) => {
                    const currentPlan = selectedPlans[school.id] ?? resolvePlanSlug(school.plan);
                    const busy = syncingId === school.id;
                    const countdown = getTrialCountdown(school.expiresAt);
                    const isSuspended = school.status === "SUSPENDED";
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
                        <td data-label="Masa Aktif / End Date" className="py-3 pr-4">
                          <div className="space-y-1">
                            {isSuspended ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                <ShieldAlert size={11} aria-hidden="true" />
                                Diblokir (Suspended)
                              </span>
                            ) : countdown.hasExpiry ? (
                              countdown.expired ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                                  <ShieldAlert size={11} aria-hidden="true" />
                                  Kedaluwarsa ({countdown.formattedDate})
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                                  <CalendarClock size={11} aria-hidden="true" />
                                  s.d. {countdown.formattedDate} ({countdown.daysLeft} hari)
                                </span>
                              )
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                                Aktif Penuh
                              </span>
                            )}
                            <div>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpiryModalSchool(school);
                                  setExpiryDateInput(formatDateInputValue(school.expiresAt));
                                  setExpiryStatusInput(school.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE");
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                              >
                                <CalendarClock size={12} aria-hidden="true" /> Atur End Date
                              </button>
                            </div>
                          </div>
                        </td>
                        <td data-label="Wilayah Dinas" className="py-3 pr-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-slate-800">
                              {school.kabupatenKota || "Belum diatur"}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setRegionModalSchool(school);
                                setRegionKabupaten(school.kabupatenKota ?? "");
                                setRegionIzin(school.izinVervalDinas !== false);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-indigo-800 hover:bg-indigo-50"
                            >
                              <MapPin size={12} /> Atur
                            </button>
                          </div>
                          <span className={`mt-1 inline-block text-[10px] font-bold ${school.izinVervalDinas === false ? "text-rose-700" : "text-emerald-700"}`}>
                            {school.izinVervalDinas === false ? "Akses Dinas nonaktif" : "Verval Dinas aktif"}
                          </span>
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

      {regionModalSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={saveSchoolRegion}
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/60 bg-white p-6 text-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">KONFIGURASI VERVAL DINAS</p>
                <h3 className="mt-1 text-lg font-extrabold">{regionModalSchool.nama}</h3>
              </div>
              <button
                type="button"
                disabled={regionBusy}
                onClick={() => setRegionModalSchool(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-xs font-bold text-slate-700">
              Kabupaten / Kota Wilayah Dinas
              <input
                type="text"
                maxLength={150}
                value={regionKabupaten}
                onChange={(e) => setRegionKabupaten(e.target.value)}
                placeholder="Contoh: Kabupaten Bandung"
                className="master-field mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </label>

            <label className="flex items-center gap-2.5 text-xs font-bold text-slate-800">
              <input
                type="checkbox"
                checked={regionIzin}
                onChange={(e) => setRegionIzin(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Izinkan Portal Dinas Pendidikan memeriksa verval Dapodik PKBM ini
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={regionBusy}
                onClick={() => setRegionModalSchool(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button type="submit" disabled={regionBusy} className="master-primary px-4 py-2 text-xs">
                {regionBusy ? "Menyimpan..." : "Simpan Wilayah"}
              </button>
            </div>
          </form>
        </div>
      )}

      {expiryModalSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/60 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">MASA AKTIF &amp; UJI COBA 14 HARI</p>
                <h3 className="mt-1 text-lg font-extrabold">{expiryModalSchool.nama}</h3>
              </div>
              <button
                type="button"
                disabled={expiryBusy}
                onClick={() => setExpiryModalSchool(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={expiryBusy}
                onClick={() => void updateSchoolExpiry(expiryModalSchool, { mode: "trial14" })}
                className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                Mulai Trial 14 Hari Baru
              </button>
              <button
                type="button"
                disabled={expiryBusy}
                onClick={() => void updateSchoolExpiry(expiryModalSchool, { mode: "extend14" })}
                className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                Perpanjang +14 Hari
              </button>
              <button
                type="button"
                disabled={expiryBusy}
                onClick={() => void updateSchoolExpiry(expiryModalSchool, { mode: "unlimited" })}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              >
                Aktif Penuh (Unlimited)
              </button>
              <button
                type="button"
                disabled={expiryBusy}
                onClick={() => void updateSchoolExpiry(expiryModalSchool, { mode: "suspend" })}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
              >
                Blokir Sekarang
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void updateSchoolExpiry(expiryModalSchool, {
                  mode: "custom",
                  expiresAt: expiryDateInput.trim() || null,
                  status: expiryStatusInput,
                });
              }}
              className="space-y-3 border-t border-slate-200 pt-3"
            >
              <label className="block text-xs font-bold text-slate-700">
                Tanggal Berakhir (End Date)
                <input
                  type="date"
                  value={expiryDateInput}
                  onChange={(e) => setExpiryDateInput(e.target.value)}
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  Kosongkan untuk menghapus tanggal kedaluwarsa. Setelah melewati end date, portal otomatis diblokir.
                </span>
              </label>

              <label className="block text-xs font-bold text-slate-700">
                Status Tenant
                <select
                  value={expiryStatusInput}
                  onChange={(e) => setExpiryStatusInput(e.target.value === "SUSPENDED" ? "SUSPENDED" : "ACTIVE")}
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                >
                  <option value="ACTIVE">ACTIVE (Mengikuti End Date)</option>
                  <option value="SUSPENDED">SUSPENDED (Blokir Paksa)</option>
                </select>
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={expiryBusy}
                  onClick={() => setExpiryModalSchool(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
                >
                  Batal
                </button>
                <button type="submit" disabled={expiryBusy} className="master-primary px-4 py-2 text-xs">
                  {expiryBusy ? "Menyimpan..." : "Simpan End Date"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={createNewSchool}
            className="max-h-[90vh] w-full max-w-lg space-y-3.5 overflow-y-auto rounded-2xl border border-white/60 bg-white p-6 text-slate-900 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">PROVISIONING TENANT BARU</p>
                <h3 className="mt-1 text-lg font-extrabold">Buat Lembaga / Uji Coba 14 Hari</h3>
              </div>
              <button
                type="button"
                disabled={createBusy}
                onClick={() => setCreateOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-bold text-slate-700 sm:col-span-2">
                Nama Sekolah / PKBM
                <input
                  type="text"
                  required
                  minLength={3}
                  value={createForm.nama}
                  onChange={(e) => setCreateForm({ ...createForm, nama: e.target.value })}
                  placeholder="Contoh: PKBM Karya Mandiri"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Subdomain / Slug
                <input
                  type="text"
                  required
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  placeholder="karya-mandiri"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                NPSN (Opsional)
                <input
                  type="text"
                  maxLength={8}
                  value={createForm.npsn}
                  onChange={(e) => setCreateForm({ ...createForm, npsn: e.target.value.toUpperCase() })}
                  placeholder="P9900112"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Paket Langganan
                <select
                  value={createForm.plan}
                  onChange={(e) => setCreateForm({ ...createForm, plan: resolvePlanSlug(e.target.value) })}
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                >
                  {PLAN_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Nama Admin Sekolah
                <input
                  type="text"
                  required
                  minLength={2}
                  value={createForm.adminName}
                  onChange={(e) => setCreateForm({ ...createForm, adminName: e.target.value })}
                  placeholder="Admin PKBM"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Email Login Admin
                <input
                  type="email"
                  required
                  value={createForm.adminEmail}
                  onChange={(e) => setCreateForm({ ...createForm, adminEmail: e.target.value })}
                  placeholder="admin@pkbm.sch.id"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-slate-700">
                Password Awal Admin
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.adminPassword}
                  onChange={(e) => setCreateForm({ ...createForm, adminPassword: e.target.value })}
                  placeholder="Minimal 6 karakter"
                  className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-950">
              <input
                type="checkbox"
                checked={createForm.trial14Hari}
                onChange={(e) => setCreateForm({ ...createForm, trial14Hari: e.target.checked })}
                className="h-4 w-4 rounded border-amber-300"
              />
              Aktifkan sebagai Uji Coba Gratis 14 Hari (otomatis blokir setelah 14 hari)
            </label>

            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={createForm.isiKontenSiapPakai}
                onChange={(e) => setCreateForm({ ...createForm, isiKontenSiapPakai: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300"
              />
              Salin modul &amp; bank soal siap pakai dari Pustaka Pusat
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={createBusy}
                onClick={() => setCreateOpen(false)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button type="submit" disabled={createBusy} className="master-primary px-4 py-2 text-xs">
                {createBusy ? "Membuat..." : "Simpan Tenant"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
    </div>
  );
}

type GlobalThemeOption = {
  key: ThemeKey;
  label: string;
  description: string;
  swatches: [string, string, string];
};

const FALLBACK_GLOBAL_THEMES: GlobalThemeOption[] = [
  {
    key: "ocean",
    label: "Ocean & Gold",
    description: "Biru laut segar dengan aksen emas modern (bawaan platform)",
    swatches: ["#0369a1", "#0284c7", "#eab308"],
  },
  {
    key: "violet",
    label: "Royal Violet",
    description: "Ungu indigo elegan berpadu aksen lavender lembut",
    swatches: ["#4338ca", "#6366f1", "#a855f7"],
  },
  {
    key: "emerald",
    label: "Emerald Nusantara",
    description: "Hijau zamrud asri dan nuansa pendidikan ramah lingkungan",
    swatches: ["#047857", "#10b981", "#f59e0b"],
  },
  {
    key: "sunset",
    label: "Sunset Warm",
    description: "Oranye terakota hangat penuh energi dan optimisme",
    swatches: ["#c2410c", "#f97316", "#facc15"],
  },
  {
    key: "dark",
    label: "Midnight Slate",
    description: "Mode gelap profesional dengan kontras tinggi",
    swatches: ["#0f172a", "#334155", "#38bdf8"],
  },
];

export function MasterGlobalThemePanel() {
  const [activeTheme, setActiveTheme] = useState<ThemeKey>("ocean");
  const [themes, setThemes] = useState<GlobalThemeOption[]>(FALLBACK_GLOBAL_THEMES);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<ThemeKey | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout("/api/master/tema", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          themeKey?: unknown;
          themes?: GlobalThemeOption[];
          error?: string;
        } | null;
        if (!response.ok) {
          throw new Error(body?.error || "Tema global belum dapat dimuat.");
        }
        if (body && isThemeKey(body.themeKey)) {
          setActiveTheme(body.themeKey);
        }
        if (body && Array.isArray(body.themes) && body.themes.length > 0) {
          setThemes(body.themes.filter((item) => isThemeKey(item.key)));
        }
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Gagal memuat konfigurasi tema global."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function selectGlobalTheme(nextTheme: ThemeKey) {
    if (busyKey) return;
    setBusyKey(nextTheme);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTimeout("/api/master/tema", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeKey: nextTheme }),
      });
      const body = (await response.json().catch(() => null)) as {
        themeKey?: unknown;
        message?: string;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || "Gagal menyimpan tema global platform.");
      }
      const resolved = isThemeKey(body?.themeKey) ? body.themeKey : nextTheme;
      setActiveTheme(resolved);
      dispatchTenantThemeChange(resolved);
      setNotice(body?.message || "Tema global platform berhasil diperbarui untuk seluruh paket & tenant.");
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Tema global belum dapat diperbarui."));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="master-section p-6 text-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-800">
            <Palette size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="master-eyebrow">TEMA GLOBAL PLATFORM</p>
            <h2 className="mt-1 text-lg font-bold">Tema Tampilan Seragam Semua Paket</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tema yang dipilih di sini berlaku otomatis dan seragam untuk seluruh akun Paket Basic, Reguler, Pro, portal sekolah, dan halaman utama.
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-900">
          Aktif: {themes.find((item) => item.key === activeTheme)?.label ?? activeTheme}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
          {notice}
        </p>
      )}

      {loading ? (
        <TableSkeleton rows={2} columns={5} />
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {themes.map((option) => {
            const isCurrent = activeTheme === option.key;
            const isSaving = busyKey === option.key;
            return (
              <button
                key={option.key}
                type="button"
                disabled={busyKey !== null}
                onClick={() => void selectGlobalTheme(option.key)}
                className={`rounded-2xl border p-3.5 text-left transition disabled:opacity-60 ${
                  isCurrent
                    ? "border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-500/30"
                    : "border-slate-200 bg-white/90 hover:border-indigo-400 hover:bg-white"
                }`}
              >
                <div
                  className="h-11 w-full rounded-xl shadow-inner"
                  style={{
                    background: `linear-gradient(120deg, ${option.swatches[0]} 0%, ${option.swatches[1]} 58%, ${option.swatches[2]} 100%)`,
                  }}
                />
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">{option.label}</span>
                  {isSaving ? (
                    <Loader2 size={14} className="animate-spin text-indigo-700" aria-hidden="true" />
                  ) : isCurrent ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-700 px-2 py-0.5 text-[10px] font-extrabold text-white">
                      <Check size={11} aria-hidden="true" />
                      Aktif
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-600">{option.description}</p>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

type DinasAccountRow = {
  id: string;
  nama: string;
  email: string | null;
  wilayahKabupaten: string | null;
  aktif: boolean;
  createdAt: string;
};

export function MasterDinasPanel() {
  const [accounts, setAccounts] = useState<DinasAccountRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [wilayahKabupaten, setWilayahKabupaten] = useState("");
  const [password, setPassword] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchWithTimeout("/api/master/dinas-akun", { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { error?: string; akun?: DinasAccountRow[] } | null;
        if (!res.ok || !body?.akun) {
          throw new Error(body?.error || "Daftar akun Dinas Pendidikan belum tersedia.");
        }
        setAccounts(body.akun);
      })
      .catch((failure: unknown) => {
        if (!isCallerAborted(failure, controller.signal)) {
          setError(describeFetchError(failure, "Gagal memuat akun Dinas Pendidikan."));
        }
      });
    return () => controller.abort();
  }, [reloadTick]);

  async function createDinasAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetchWithTimeout("/api/master/dinas-akun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama, email, wilayahKabupaten, password }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal membuat akun petugas Dinas.");
      }
      setNotice(body?.message || "Akun Dinas Pendidikan berhasil dibuat.");
      setNama("");
      setEmail("");
      setWilayahKabupaten("");
      setPassword("");
      setReloadTick((v) => v + 1);
    } catch (failure: unknown) {
      setError(describeFetchError(failure, "Gagal membuat akun Dinas Pendidikan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="master-section p-6 text-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="master-eyebrow">PORTAL DINAS PENDIDIKAN WILAYAH</p>
            <h2 className="mt-1 text-lg font-bold">Akun Verifikator Dinas Kabupaten/Kota</h2>
            <p className="mt-1 text-sm text-slate-600">
              Buat akun petugas Dinas Pendidikan untuk memantau dan memverifikasi data PKBM di kabupaten/kota tertentu.
            </p>
          </div>
          <Link to="/dinas" className="master-primary inline-flex items-center gap-2 px-4 py-2.5 text-xs">
            <Landmark size={15} /> Buka Portal Dinas (/dinas)
          </Link>
        </div>

        <form onSubmit={createDinasAccount} className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-bold text-slate-700">
            Nama Petugas Dinas
            <input
              type="text"
              required
              minLength={2}
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Verifikator Disdik Bandung"
              className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Email Login Dinas
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="verval.bandung@disdik.go.id"
              className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Wilayah Kabupaten / Kota
            <input
              type="text"
              required
              minLength={2}
              value={wilayahKabupaten}
              onChange={(e) => setWilayahKabupaten(e.target.value)}
              placeholder="Contoh: Kabupaten Bandung"
              className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-700">
            Password Awal
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              className="master-field mt-1 w-full rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap items-center justify-between gap-3 pt-1">
            <div>
              {error && <p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
              {notice && <p role="status" className="text-xs font-bold text-emerald-700">{notice}</p>}
            </div>
            <button type="submit" disabled={busy} className="master-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-xs">
              <Plus size={14} /> {busy ? "Membuat..." : "Tambah Akun Dinas"}
            </button>
          </div>
        </form>
      </section>

      <section className="master-section p-6 text-slate-900">
        <h3 className="text-base font-bold">Daftar Akun Dinas Terdaftar</h3>
        {!accounts ? (
          <TableSkeleton rows={3} columns={4} />
        ) : accounts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Belum ada akun verifikator Dinas yang dibuat.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="master-schools-table w-full text-left text-sm">
              <thead className="border-b border-[#e6dfd0] text-slate-600">
                <tr>
                  <th className="py-2.5 pr-4">Nama Petugas</th>
                  <th className="py-2.5 pr-4">Email</th>
                  <th className="py-2.5 pr-4">Wilayah Tugas</th>
                  <th className="py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-[#e6dfd0]">
                    <td data-label="Nama" className="py-2.5 pr-4 font-semibold">{acc.nama}</td>
                    <td data-label="Email" className="py-2.5 pr-4 font-mono text-xs">{acc.email ?? "—"}</td>
                    <td data-label="Wilayah" className="py-2.5 pr-4 font-semibold text-indigo-800">{acc.wilayahKabupaten ?? "—"}</td>
                    <td data-label="Status" className="py-2.5 text-xs font-bold text-emerald-700">{acc.aktif ? "Aktif" : "Nonaktif"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
