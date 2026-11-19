import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { getPlanBySlug, resolvePlanSlug, SUBSCRIPTION_PLANS, type PlanSlug } from "./subscriptionPlans";

const inputClass = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[#142137]";

export function SchoolRegistration() {
  const [searchParams] = useSearchParams();
  const initialSlug = resolvePlanSlug(searchParams.get("paket"));
  const [selectedSlug, setSelectedSlug] = useState<PlanSlug>(initialSlug);
  const [form, setForm] = useState({ namaSekolah: "", npsn: "", wilayah: "", namaKontak: "", emailKontak: "", teleponKontak: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const queryPlan = searchParams.get("paket");
    if (queryPlan) {
      setSelectedSlug(resolvePlanSlug(queryPlan));
    }
  }, [searchParams]);

  const activePlan = getPlanBySlug(selectedSlug);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/pendaftaran-sekolah", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, paket: activePlan.planValue }),
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
      setMessage(`Pendaftaran untuk ${activePlan.name} terkirim ke Rasyatech Admin dan menunggu verifikasi. Akun LMS dibuat setelah disetujui.`);
      setForm({ namaSekolah: "", npsn: "", wilayah: "", namaKontak: "", emailKontak: "", teleponKontak: "" });
    } catch (error) {
      console.error("Gagal mengirim pendaftaran sekolah:", error);
      setError(error instanceof TypeError ? "Server tidak dapat dihubungi. Pastikan backend berjalan." : error instanceof Error ? error.message : "Pendaftaran belum dapat disimpan.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="glass-shell glass-area min-h-screen px-5 py-12"><div className="glass-panel mx-auto max-w-2xl rounded-3xl p-6 sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-[#80643a]">Rasyatech Digital Zenith</p>
    <h1 className="mt-3 text-3xl font-bold">Pendaftaran sekolah</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Pendaftaran diteruskan ke Rasyatech Admin beserta paket langganan pilihan Anda. Akun sekolah dan admin LMS baru dibuat setelah verifikasi disetujui.</p>
    {message ? <div role="status" className="mt-6 rounded-xl bg-[#f8f6ef] p-5 text-sm leading-6">{message}</div> :
      <form onSubmit={submit} className="mt-6 space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-[#142137]">Paket Langganan</legend>
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
                    <p className="mt-2 text-lg font-extrabold text-indigo-800">
                      {plan.price} <span className="text-xs font-medium text-slate-600">{plan.period}</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{plan.duration}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold">Nama sekolah<input className={inputClass} required minLength={2} maxLength={200} value={form.namaSekolah} onChange={(e) => setForm({ ...form, namaSekolah: e.target.value })} /></label>
        <label className="block text-sm font-semibold">NPSN<input className={inputClass} required autoCapitalize="characters" pattern="([0-9]{8}|[PpKk][0-9]{7})" title="Masukkan 8 angka atau huruf P/K diikuti 7 angka." aria-describedby="npsn-help" maxLength={8} value={form.npsn} onChange={(e) => setForm({ ...form, npsn: e.target.value.toUpperCase() })} /><span id="npsn-help" className="mt-2 block text-xs font-normal text-slate-600">Wajib untuk pencocokan pendaftaran dan provisioning. Gunakan 8 angka, atau huruf P/K diikuti 7 angka.</span></label>
        <label className="block text-sm font-semibold">Wilayah (opsional)<input className={inputClass} maxLength={200} value={form.wilayah} onChange={(e) => setForm({ ...form, wilayah: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Nama penanggung jawab<input className={inputClass} required minLength={2} maxLength={120} value={form.namaKontak} onChange={(e) => setForm({ ...form, namaKontak: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Email penanggung jawab<input className={inputClass} type="email" required maxLength={254} value={form.emailKontak} onChange={(e) => setForm({ ...form, emailKontak: e.target.value })} /></label>
        <label className="block text-sm font-semibold">Nomor telepon<input className={inputClass} type="tel" required minLength={6} maxLength={30} value={form.teleponKontak} onChange={(e) => setForm({ ...form, teleponKontak: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-[#0c192d] px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Mengirim..." : "Kirim pendaftaran"}</button>
      </form>}
    <Link to="/" className="mt-6 inline-block text-sm font-semibold text-[#80643a] underline">Kembali ke beranda</Link>
  </div></main>;
}
