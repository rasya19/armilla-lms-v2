import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, Check, CheckCircle2, Eye, EyeOff, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { getPlanBySlug, resolvePlanSlug, SUBSCRIPTION_PLANS, type PlanSlug } from "./subscriptionPlans";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import { formatEndDateId, previewTrialEndDate, TRIAL_DURATION_DAYS } from "./trialDates";

const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[#142137]";

type RegistrationMode = "trial" | "annual";

type TrialActivationResult = {
  message: string;
  trialDays: number;
  startDate: string;
  endDate: string;
  adminEmail: string;
  portalUrl: string;
  sekolah: {
    id: string;
    nama: string;
    slug: string;
    plan: string;
    expiresAt: string;
  };
};

function sanitizeSlugInput(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 48);
}

export function SchoolRegistration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryMode = searchParams.get("mode") === "trial" ? "trial" : "annual";
  const queryPlan = searchParams.get("paket");
  const initialSlug: PlanSlug = queryPlan ? resolvePlanSlug(queryPlan) : queryMode === "trial" ? "pro" : "basic";

  const [mode, setMode] = useState<RegistrationMode>(queryMode);
  const [selectedSlug, setSelectedSlug] = useState<PlanSlug>(initialSlug);
  const [slugTouched, setSlugTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    namaSekolah: "",
    slug: "",
    npsn: "",
    wilayah: "",
    namaKontak: "",
    emailKontak: "",
    teleponKontak: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [trialResult, setTrialResult] = useState<TrialActivationResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const nextMode: RegistrationMode = searchParams.get("mode") === "trial" ? "trial" : "annual";
    setMode(nextMode);
    if (queryPlan) {
      setSelectedSlug(resolvePlanSlug(queryPlan));
    } else if (nextMode === "trial") {
      setSelectedSlug("pro");
    }
  }, [searchParams, queryPlan]);

  const activePlan = getPlanBySlug(selectedSlug);
  const previewStart = new Date();
  const previewEnd = previewTrialEndDate(previewStart, TRIAL_DURATION_DAYS);

  function switchMode(nextMode: RegistrationMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setTrialResult(null);
    const nextParams = new URLSearchParams(searchParams);
    if (nextMode === "trial") {
      nextParams.set("mode", "trial");
      if (!queryPlan) setSelectedSlug("pro");
    } else {
      nextParams.delete("mode");
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handleSchoolNameChange(value: string) {
    setForm((prev) => ({
      ...prev,
      namaSekolah: value,
      slug: !slugTouched ? sanitizeSlugInput(value).replace(/-+$/g, "") : prev.slug,
    }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "trial") {
        const cleanSlug = sanitizeSlugInput(form.slug).replace(/-+$/g, "");
        const response = await fetchWithTimeout("/api/pendaftaran-sekolah/coba-gratis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            namaSekolah: form.namaSekolah,
            slug: cleanSlug,
            npsn: form.npsn.trim() || undefined,
            wilayah: form.wilayah,
            namaKontak: form.namaKontak,
            emailKontak: form.emailKontak,
            teleponKontak: form.teleponKontak,
            password: form.password,
            paket: activePlan.planValue,
            plan: activePlan.slug,
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | (TrialActivationResult & { error?: string })
          | null;
        if (!response.ok || !data?.sekolah) {
          throw new Error(data?.error || "Aktivasi uji coba gratis 14 hari belum dapat diproses.");
        }
        setTrialResult(data);
        setForm({
          namaSekolah: "",
          slug: "",
          npsn: "",
          wilayah: "",
          namaKontak: "",
          emailKontak: "",
          teleponKontak: "",
          password: "",
        });
        setSlugTouched(false);
        return;
      }

      const response = await fetchWithTimeout("/api/pendaftaran-sekolah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namaSekolah: form.namaSekolah,
          npsn: form.npsn,
          wilayah: form.wilayah,
          namaKontak: form.namaKontak,
          emailKontak: form.emailKontak,
          teleponKontak: form.teleponKontak,
          paket: activePlan.planValue,
          nominalTahunan: activePlan.annualPrice,
        }),
      });
      if (!response.ok) {
        let detail = "Pendaftaran belum dapat disimpan. Pastikan server berjalan dan coba lagi.";
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data: unknown = await response.json();
          if (typeof data === "object" && data !== null && "error" in data && typeof data.error === "string") {
            detail = data.error;
            if ("code" in data && typeof data.code === "string" && /^(?:REGISTRATION|MASTER_ADMIN_REGISTRATION)_[A-Z_]+$/.test(data.code)) detail += ` (${data.code})`;
            if ("reference" in data && typeof data.reference === "string" && /^[a-f0-9-]{36}$/.test(data.reference)) detail += ` Referensi: ${data.reference}`;
          }
        }
        throw new Error(detail);
      }
      setMessage(`Pendaftaran untuk ${activePlan.name} (${activePlan.annualPriceLabel}) terkirim ke Rasyatech Admin dan menunggu verifikasi. Akun LMS dibuat setelah disetujui.`);
      setForm({
        namaSekolah: "",
        slug: "",
        npsn: "",
        wilayah: "",
        namaKontak: "",
        emailKontak: "",
        teleponKontak: "",
        password: "",
      });
    } catch (failure) {
      setError(describeFetchError(failure, "Pendaftaran belum dapat disimpan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="glass-shell glass-area min-h-screen px-5 py-12">
      <div className="glass-panel mx-auto max-w-2xl rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <BrandLogo alt="Logo SIPUT PKBM" className="h-11 w-11 rounded-xl" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#80643a]">SIPUT PKBM · Rasyatech Digital Zenith</p>
            <h1 className="mt-0.5 text-2xl font-bold sm:text-3xl">
              {mode === "trial" ? "Coba Gratis 14 Hari" : "Pendaftaran sekolah"}
            </h1>
          </div>
        </div>

        <div role="tablist" aria-label="Pilih mode pendaftaran" className="mt-5 grid grid-cols-1 gap-2 rounded-2xl border border-slate-200/80 bg-white/75 p-1.5 sm:grid-cols-2">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "trial"}
            onClick={() => switchMode("trial")}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              mode === "trial"
                ? "bg-sky-700 text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Sparkles size={15} aria-hidden="true" />
            Coba Gratis 14 Hari (Aktif Instan)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "annual"}
            onClick={() => switchMode("annual")}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:text-sm ${
              mode === "annual"
                ? "bg-[#0c192d] text-white shadow-sm"
                : "text-slate-700 hover:bg-slate-100"
            }`}
          >
            Daftar Langganan Tahunan
          </button>
        </div>

        {mode === "trial" ? (
          <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/90 p-4 text-xs leading-6 text-sky-950">
            <div className="flex items-start gap-2.5">
              <CalendarClock size={18} className="mt-0.5 shrink-0 text-sky-700" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-bold">
                  Aktif hari ini ({formatEndDateId(previewStart)}) · Berakhir otomatis pada{" "}
                  <span className="text-sky-800 underline decoration-sky-400 underline-offset-2">
                    {formatEndDateId(previewEnd)}
                  </span>{" "}
                  (14 hari).
                </p>
                <p className="text-sky-900/90">
                  Portal admin &amp; LMS sekolah langsung aktif selama 14 hari. Setelah melewati tanggal berakhir (end date), akses portal dan seluruh login otomatis diblokir sampai langganan diaktifkan oleh pengelola.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Pendaftaran diteruskan ke Rasyatech Admin beserta paket langganan pilihan Anda. Akun sekolah dan admin LMS baru dibuat setelah verifikasi disetujui.
          </p>
        )}

        {trialResult ? (
          <div role="status" className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-6 text-sm text-emerald-950">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h2 className="text-lg font-extrabold">Uji Coba Gratis 14 Hari Aktif!</h2>
                <p className="mt-1 text-xs leading-5 text-emerald-900">{trialResult.message}</p>
              </div>
            </div>
            <dl className="grid gap-2.5 rounded-xl border border-emerald-200/80 bg-white/90 p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Nama Lembaga</dt>
                <dd className="mt-0.5 font-bold text-slate-900">{trialResult.sekolah.nama}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Subdomain Portal</dt>
                <dd className="mt-0.5 font-mono font-bold text-sky-800">{trialResult.sekolah.slug}.pkbm.siput.id</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Email Login Admin</dt>
                <dd className="mt-0.5 font-bold text-slate-900">{trialResult.adminEmail}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">End Date / Berakhir Otomatis</dt>
                <dd className="mt-0.5 font-extrabold text-amber-800">
                  {formatEndDateId(trialResult.endDate, true)}
                </dd>
              </div>
            </dl>
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3.5 py-2.5 text-xs text-amber-950">
              <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <span>Akses otomatis diblokir setelah {trialResult.trialDays} hari apabila belum diperpanjang menjadi langganan resmi.</span>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link to="/login" className="master-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold">
                Masuk Login Admin Sekarang
              </Link>
              <a
                href={trialResult.portalUrl}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50"
              >
                Buka Portal Subdomain
              </a>
            </div>
          </div>
        ) : message ? (
          <div role="status" className="mt-6 rounded-xl bg-[#f8f6ef] p-5 text-sm leading-6">{message}</div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[#142137]">
                {mode === "trial" ? "Pilih Paket untuk Uji Coba Gratis 14 Hari" : "Paket Langganan"}
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                {SUBSCRIPTION_PLANS.map((plan) => {
                  const checked = selectedSlug === plan.slug;
                  return (
                    <label
                      key={plan.slug}
                      className={`relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition ${
                        checked
                          ? "border-indigo-600 bg-indigo-50/90 ring-2 ring-indigo-600/30"
                          : "border-slate-300 bg-white/85 hover:border-indigo-400"
                      }`}
                    >
                      <input
                        type="radio"
                        name="paket"
                        value={plan.planValue}
                        checked={checked}
                        onChange={() => setSelectedSlug(plan.slug)}
                        className="sr-only"
                      />
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-[#142137]">{plan.name}</span>
                          {checked && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white">
                              <Check size={12} />
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-base font-extrabold text-indigo-800">
                          {mode === "trial" ? "Rp 0 / 14 Hari" : plan.annualPriceLabel}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                          {mode === "trial" ? `Normal ${plan.price} ${plan.period}` : `${plan.price} ${plan.period}`}
                        </p>
                        <span className="mt-2 inline-block rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold text-indigo-900">
                          {mode === "trial" ? "Trial 14 Hari" : plan.popular ? "Populer • Hemat 2 Bulan" : plan.badge}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-slate-600">
                {mode === "trial" ? (
                  <>
                    Terpilih: <span className="font-semibold text-[#142137]">{activePlan.name} (Uji Coba Gratis 14 Hari)</span> — berlaku hingga{" "}
                    <span className="font-semibold text-sky-800">{formatEndDateId(previewEnd)}</span>.
                  </>
                ) : (
                  <>
                    Terpilih: <span className="font-semibold text-[#142137]">{activePlan.name} — {activePlan.annualPriceLabel}</span> ({activePlan.billingNote}).
                  </>
                )}
              </p>
            </fieldset>

            <label className="block text-sm font-semibold">
              Nama sekolah / PKBM
              <input
                className={inputClass}
                required
                minLength={mode === "trial" ? 3 : 2}
                maxLength={200}
                placeholder="Contoh: PKBM Harapan Bangsa"
                value={form.namaSekolah}
                onChange={(e) => handleSchoolNameChange(e.target.value)}
              />
            </label>

            {mode === "trial" && (
              <label className="block text-sm font-semibold">
                Subdomain Portal Sekolah
                <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-500/20">
                  <input
                    className="min-w-0 flex-1 px-4 py-3 font-mono text-sm text-[#142137] focus:outline-none"
                    required
                    minLength={3}
                    maxLength={48}
                    pattern="[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?"
                    title="Gunakan 3-48 karakter huruf kecil, angka, atau tanda hubung."
                    placeholder="pkbm-harapan"
                    value={form.slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setForm({ ...form, slug: sanitizeSlugInput(e.target.value) });
                    }}
                  />
                  <span className="border-l border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs font-bold text-slate-600">
                    .pkbm.siput.id
                  </span>
                </div>
              </label>
            )}

            <label className="block text-sm font-semibold">
              {mode === "trial" ? "NPSN (opsional saat uji coba)" : "NPSN"}
              <input
                className={inputClass}
                required={mode !== "trial"}
                autoCapitalize="characters"
                pattern="([0-9]{8}|[PpKk][0-9]{7})"
                title="Masukkan 8 angka atau huruf P/K diikuti 7 angka."
                aria-describedby="npsn-help"
                maxLength={8}
                placeholder="Contoh: P9988776"
                value={form.npsn}
                onChange={(e) => setForm({ ...form, npsn: e.target.value.toUpperCase() })}
              />
              <span id="npsn-help" className="mt-2 block text-xs font-normal text-slate-600">
                {mode === "trial"
                  ? "Boleh dikosongkan selama masa uji coba 14 hari. Jika diisi, gunakan 8 angka atau P/K diikuti 7 angka."
                  : "Wajib untuk pencocokan pendaftaran dan provisioning. Gunakan 8 angka, atau huruf P/K diikuti 7 angka."}
              </span>
            </label>

            <label className="block text-sm font-semibold">
              Wilayah (opsional)
              <input
                className={inputClass}
                maxLength={200}
                placeholder="Contoh: Kabupaten Bandung"
                value={form.wilayah}
                onChange={(e) => setForm({ ...form, wilayah: e.target.value })}
              />
            </label>

            <label className="block text-sm font-semibold">
              Nama penanggung jawab
              <input
                className={inputClass}
                required
                minLength={2}
                maxLength={120}
                value={form.namaKontak}
                onChange={(e) => setForm({ ...form, namaKontak: e.target.value })}
              />
            </label>

            <label className="block text-sm font-semibold">
              {mode === "trial" ? "Email Login Admin Sekolah" : "Email penanggung jawab"}
              <input
                className={inputClass}
                type="email"
                required
                maxLength={254}
                placeholder="admin@pkbmanda.sch.id"
                value={form.emailKontak}
                onChange={(e) => setForm({ ...form, emailKontak: e.target.value })}
              />
            </label>

            <label className="block text-sm font-semibold">
              Nomor telepon / WhatsApp
              <input
                className={inputClass}
                type="tel"
                required
                minLength={6}
                maxLength={30}
                placeholder="081234567890"
                value={form.teleponKontak}
                onChange={(e) => setForm({ ...form, teleponKontak: e.target.value })}
              />
            </label>

            {mode === "trial" && (
              <div>
                <label htmlFor="trial-admin-password" className="block text-sm font-semibold">
                  Kata Sandi Login Admin (Minimal 6 karakter)
                </label>
                <div className="relative mt-2">
                  <input
                    id="trial-admin-password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Buat kata sandi untuk masuk portal admin"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-4 pr-12 text-[#142137]"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-slate-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}

            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#0c192d] px-4 py-3.5 font-bold text-white transition hover:bg-[#132643] disabled:cursor-not-allowed disabled:opacity-75"
            >
              {busy ? (
                <Loader2 size={18} className="animate-spin" aria-hidden="true" />
              ) : mode === "trial" ? (
                <Sparkles size={18} aria-hidden="true" />
              ) : null}
              <span>
                {busy
                  ? mode === "trial"
                    ? "Mengaktifkan uji coba 14 hari..."
                    : "Mengirim & menyinkronkan pendaftaran..."
                  : mode === "trial"
                    ? "Aktifkan Uji Coba Gratis 14 Hari"
                    : "Kirim pendaftaran"}
              </span>
            </button>
          </form>
        )}

        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-[#80643a] underline">
          Kembali ke beranda
        </Link>
      </div>
    </main>
  );
}
