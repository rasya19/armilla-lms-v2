import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  Printer,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  WalletCards,
} from "lucide-react";
import { CardGridSkeleton, DashboardHero, TableSkeleton } from "./DashboardUI";
import { useTenantTheme } from "./TenantThemeProvider";
import { ADMIN_WA_DISPLAY, buildAdminWhatsappUrl, SUBSCRIPTION_PLANS, getPlanBySlug, resolvePlanSlug, type PlanSlug } from "./subscriptionPlans";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";
import { sanitizeHttpUrl } from "../utils/safeUrl";

type SubscriptionHistoryItem = {
  id: string;
  merchantOrderId: string;
  reference: string | null;
  provider: string;
  environment: string;
  plan: PlanSlug;
  planLabel: string;
  amount: number;
  paymentMethod: string | null;
  paymentUrl: string | null;
  status: string;
  paidAt: string | null;
  createdAt: string;
};

type SubscriptionStatusResponse = {
  sekolah: {
    id: string;
    nama: string;
    slug: string;
    plan: PlanSlug;
    status: string;
    expiresAt: string | null;
    daysRemaining: number | null;
  };
  paymentGatewayReady: boolean;
  paymentProvider: "duitku" | "midtrans" | "manual";
  duitkuEnv: "sandbox" | "production" | null;
  duitkuMerchantCode: string | null;
  whatsappReady: boolean;
  riwayatPembayaran: SubscriptionHistoryItem[];
};

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch),
  );
}

function statusBadgeMeta(status: string, isDark: boolean): { label: string; className: string } {
  switch (status.toUpperCase()) {
    case "PAID":
      return {
        label: "LUNAS",
        className: isDark
          ? "border-emerald-400/35 bg-emerald-500/20 text-emerald-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    case "PENDING":
    case "MENUNGGU BAYAR":
    case "MENUNGGU_BAYAR":
      return {
        label: "MENUNGGU BAYAR",
        className: isDark
          ? "border-amber-400/35 bg-amber-500/20 text-amber-200"
          : "border-amber-200 bg-amber-50 text-amber-800",
      };
    case "EXPIRED":
      return {
        label: "KEDALUWARSA",
        className: isDark
          ? "border-rose-400/35 bg-rose-500/20 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-800",
      };
    default:
      return {
        label: "GAGAL",
        className: isDark
          ? "border-rose-400/35 bg-rose-500/20 text-rose-200"
          : "border-rose-200 bg-rose-50 text-rose-800",
      };
  }
}

export function SchoolSubscriptionView({ onRefreshPlan }: { onRefreshPlan?: () => void }) {
  const isDark = useTenantTheme() === "dark";
  const [data, setData] = useState<SubscriptionStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>("pro");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<string | null>(null);
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState("");
  const [checkoutResult, setCheckoutResult] = useState<{
    orderId: string;
    reference: string | null;
    planLabel: string;
    amount: number;
    paymentUrl: string | null;
    mode: string;
    message: string;
  } | null>(null);

  const [returnOrderId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("payment") === "return" ? params.get("orderId") || "terbaru" : null;
  });

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/sekolah/langganan/status", { cache: "no-store", signal });
      const body = (await res.json().catch(() => null)) as (SubscriptionStatusResponse & { error?: string }) | null;
      if (!res.ok || !body?.sekolah) {
        throw new Error(body?.error || "Status langganan belum dapat dimuat.");
      }
      setData(body);
      setSelectedPlan((prev) => prev || resolvePlanSlug(body.sekolah.plan));
    } catch (failure) {
      if (!isCallerAborted(failure, signal)) {
        setError(describeFetchError(failure, "Status langganan belum tersedia."));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadStatus(controller.signal);
    return () => controller.abort();
  }, [loadStatus]);

  async function handleCheckout() {
    if (checkoutBusy) return;
    setCheckoutBusy(true);
    setCheckoutError("");
    try {
      const res = await fetchWithTimeout(
        "/api/sekolah/langganan/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: selectedPlan }),
        },
        20_000,
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        orderId?: string;
        reference?: string | null;
        planLabel?: string;
        amount?: number;
        paymentUrl?: string | null;
        mode?: string;
        message?: string;
      } | null;
      if (!res.ok || !body?.orderId) {
        throw new Error(body?.error || "Gagal membuat tagihan pembayaran.");
      }
      const planInfo = getPlanBySlug(selectedPlan);
      setCheckoutResult({
        orderId: body.orderId,
        reference: body.reference ?? null,
        planLabel: body.planLabel || planInfo.name,
        amount: body.amount ?? planInfo.annualPrice,
        paymentUrl: body.paymentUrl ?? null,
        mode: body.mode || "duitku",
        message: body.message || "Tagihan berhasil dibuat.",
      });
      const safePaymentUrl = sanitizeHttpUrl(body.paymentUrl);
      if (safePaymentUrl) {
        window.open(safePaymentUrl, "_blank", "noopener,noreferrer");
      }
      await loadStatus();
    } catch (failure) {
      setCheckoutError(describeFetchError(failure, "Tagihan pembayaran belum dapat dibuat."));
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function handleCancelInvoice(merchantOrderId: string) {
    if (cancelingOrderId) return;
    setCancelingOrderId(merchantOrderId);
    setError("");
    setActionNotice("");
    try {
      const res = await fetchWithTimeout(`/api/payment/invoices/${encodeURIComponent(merchantOrderId)}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Tagihan tidak dapat dibatalkan.");
      }
      setConfirmCancelOrderId(null);
      setCheckoutResult((prev) => (prev?.orderId === merchantOrderId ? null : prev));
      setActionNotice(body?.message || `Tagihan ${merchantOrderId} berhasil dibatalkan.`);
      await loadStatus();
    } catch (failure) {
      setError(describeFetchError(failure, "Gagal membatalkan tagihan."));
    } finally {
      setCancelingOrderId(null);
    }
  }

  function handlePrintInvoice(order: { orderId: string; planLabel: string; amount: number }) {
    const schoolName = data?.sekolah.nama || "Lembaga Pendidikan";
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return;
    const todayStr = dateFormat.format(new Date());
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.orderId)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:32px;max-width:760px;margin:auto}h1{margin:0;font-size:22px}.muted{color:#475569;font-size:12px}.box{border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin-top:20px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}.right{text-align:right}.total{font-size:16px;font-weight:800;background:#eef2ff}@media print{button{display:none}}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:16px"><div><h1>INVOICE LANGGANAN LMS</h1><p class="muted">Tagihan Resmi Aktivasi / Perpanjangan Layanan Platform Pendidikan</p></div><div class="right"><p style="margin:0;font-weight:700;font-family:monospace">${escapeHtml(order.orderId)}</p><p class="muted" style="margin:4px 0 0">Tanggal: ${escapeHtml(todayStr)}</p></div></div><div class="box"><p style="margin:0;font-size:12px;color:#64748b">Ditagihkan Kepada:</p><p style="margin:4px 0 0;font-size:16px;font-weight:700">${escapeHtml(schoolName)}</p></div><table><thead><tr><th>Deskripsi Layanan</th><th class="right">Durasi</th><th class="right">Nominal</th></tr></thead><tbody><tr><td><strong>${escapeHtml(order.planLabel)}</strong><br><span class="muted">Akses penuh portal LMS multi-tenant, E-Modul, CBT &amp; E-Raport</span></td><td class="right">12 Bulan (365 Hari)</td><td class="right">${escapeHtml(formatRupiah(order.amount))}</td></tr><tr class="total"><td colspan="2" class="right">Total Tagihan</td><td class="right">${escapeHtml(formatRupiah(order.amount))}</td></tr></tbody></table><p class="muted" style="margin-top:20px">Dokumen ini dicetak secara elektronik dan sah digunakan untuk administrasi pembayaran lembaga / dana BOP / BOS.</p><button onclick="window.print()" style="margin-top:16px;padding:10px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer">Cetak / Simpan sebagai PDF</button></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  const currentPlanInfo = data ? getPlanBySlug(resolvePlanSlug(data.sekolah.plan)) : null;

  return (
    <div className="space-y-6">
      <section className="dashboard-glass space-y-6 rounded-2xl p-6">
        <DashboardHero
          eyebrow="TAGIHAN & LANGGANAN"
          title="Langganan & Pembayaran Duitku"
          description="Pantau masa aktif layanan lembaga Anda, lakukan perpanjangan atau upgrade paket via QRIS / Virtual Account / E-Wallet Duitku, dan lihat riwayat tagihan."
          badge={
            data?.paymentProvider === "duitku"
              ? `Duitku ${data.duitkuEnv === "production" ? "Production" : "Sandbox"}`
              : "Billing Lembaga"
          }
          action={
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                void loadStatus();
                onRefreshPlan?.();
              }}
              className="dashboard-hero-action disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              Segarkan Status
            </button>
          }
        />

        {returnOrderId && (
          <div
            role="status"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs ${
              isDark
                ? "border-indigo-400/35 bg-indigo-500/15 text-indigo-100"
                : "border-indigo-200 bg-indigo-50 text-indigo-950"
            }`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
              Kembali dari halaman pembayaran Duitku (Order: <code className="font-mono">{returnOrderId}</code>). Status paket akan terbarui otomatis setelah callback diterima.
            </span>
            <button
              type="button"
              onClick={() => {
                void loadStatus();
                onRefreshPlan?.();
              }}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 font-bold text-white hover:bg-indigo-500"
            >
              Cek Pembaruan Paket
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
            {error}
          </p>
        )}

        {!data && loading ? (
          <CardGridSkeleton count={3} columns={3} />
        ) : (
          data && (
            <div className="grid gap-4 md:grid-cols-3">
              <div
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/80"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Paket Aktif Lembaga</span>
                  <Sparkles size={16} className="text-indigo-500" />
                </div>
                <p className={`mt-2 text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  {currentPlanInfo?.name ?? data.sekolah.plan.toUpperCase()}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Status:{" "}
                  <strong className={data.sekolah.status === "ACTIVE" ? "text-emerald-600" : "text-rose-600"}>
                    {data.sekolah.status}
                  </strong>
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/80"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Masa Aktif Layanan</span>
                  <CalendarClock size={16} className="text-sky-500" />
                </div>
                <p className={`mt-2 text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.sekolah.expiresAt ? dateFormat.format(new Date(data.sekolah.expiresAt)) : "Aktif Tanpa Batas"}
                </p>
                <p className={`mt-1 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  {data.sekolah.daysRemaining !== null
                    ? `Sisa masa aktif: ${data.sekolah.daysRemaining} hari`
                    : "Perpanjangan tahunan (365 hari)"}
                </p>
              </div>

              <div
                className={`rounded-2xl border p-4 ${
                  isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white/80"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                  <span>Gateway Pembayaran</span>
                  <ShieldCheck size={16} className="text-emerald-500" />
                </div>
                <p className={`mt-2 text-lg font-black ${isDark ? "text-white" : "text-slate-900"}`}>
                  {data.paymentProvider === "duitku"
                    ? "Duitku Aktif"
                    : data.paymentProvider === "midtrans"
                      ? "Midtrans Aktif"
                      : "Konfirmasi Manual"}
                </p>
                <p className={`mt-1 font-mono text-[11px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  {data.paymentProvider === "duitku"
                    ? `Merchant ${data.duitkuMerchantCode || "—"} · ${(data.duitkuEnv || "sandbox").toUpperCase()}`
                    : "QRIS / Virtual Account / Transfer"}
                </p>
              </div>
            </div>
          )
        )}
      </section>

      <section className="dashboard-glass space-y-5 rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
              AKTIVASI &amp; PERPANJANGAN PAKET
            </p>
            <h2 className={`mt-1 text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Pilih Paket Tahunan (12 Bulan)
            </h2>
            <p className={`mt-1 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Pembayaran melalui Duitku mendukung QRIS, Virtual Account bank nasional, dan E-Wallet dengan pembaruan paket otomatis.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const selected = selectedPlan === plan.slug;
            const isCurrent = data ? resolvePlanSlug(data.sekolah.plan) === plan.slug : false;
            return (
              <button
                key={plan.slug}
                type="button"
                onClick={() => {
                  setSelectedPlan(plan.slug);
                  setCheckoutError("");
                }}
                className={`flex flex-col rounded-2xl border p-4 text-left transition ${
                  selected
                    ? isDark
                      ? "border-indigo-400 bg-indigo-500/20 ring-2 ring-indigo-400/30"
                      : "border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20"
                    : isDark
                      ? "border-white/10 bg-white/5 hover:border-indigo-400/50"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
                    {plan.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isCurrent && (
                      <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                        Aktif
                      </span>
                    )}
                    {selected && <Check size={16} className="text-indigo-500" />}
                  </div>
                </div>
                <p className={`mt-2 text-xl font-black ${isDark ? "text-indigo-200" : "text-indigo-800"}`}>
                  {plan.annualPriceLabel}
                </p>
                <p className={`text-[11px] ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                  {plan.price} {plan.period} · {plan.badge}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      className={`flex items-start gap-2 text-xs ${isDark ? "text-slate-200" : "text-slate-700"}`}
                    >
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {checkoutError && (
          <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
            {checkoutError}
          </p>
        )}

        {checkoutResult && (
          <div
            role="status"
            className={`space-y-2.5 rounded-xl border p-4 text-xs ${
              isDark
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
          >
            <p className="font-bold">{checkoutResult.message}</p>
            <p className="font-mono text-[11px]">
              Order ID: <strong>{checkoutResult.orderId}</strong> · {formatRupiah(checkoutResult.amount)}
              {checkoutResult.reference ? ` · Ref Duitku: ${checkoutResult.reference}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {sanitizeHttpUrl(checkoutResult.paymentUrl) && (
                <a
                  href={sanitizeHttpUrl(checkoutResult.paymentUrl)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 font-bold text-white hover:bg-emerald-500"
                >
                  Buka Halaman Pembayaran Duitku <ExternalLink size={14} />
                </a>
              )}
              <button
                type="button"
                onClick={() => handlePrintInvoice(checkoutResult)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 font-bold text-slate-800 hover:bg-slate-50"
              >
                <Printer size={14} />
                Cetak Invoice PDF
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/60 pt-4">
          <p className={`text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            Paket terpilih: <strong>{getPlanBySlug(selectedPlan).name}</strong> (
            <strong>{getPlanBySlug(selectedPlan).annualPriceLabel}</strong>)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={buildAdminWhatsappUrl(
                `Halo Admin SIPUT PKBM, saya dari ${data?.sekolah.nama || "PKBM"} ingin info lebih lanjut / pemesanan ${getPlanBySlug(selectedPlan).name} (${getPlanBySlug(selectedPlan).annualPriceLabel}).`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
            >
              Hubungi Admin ({ADMIN_WA_DISPLAY})
            </a>
            <button
              type="button"
              disabled={checkoutBusy}
              onClick={() => void handleCheckout()}
            className="master-primary inline-flex items-center gap-2 px-5 py-2.5 text-xs font-extrabold disabled:opacity-50"
          >
            {checkoutBusy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
            {checkoutBusy ? "Membuat Tagihan Duitku..." : "Bayar / Perpanjang via Duitku"}
          </button>
          </div>
        </div>
      </section>

      <section className="dashboard-glass space-y-4 rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600">
              RIWAYAT TRANSAKSI
            </p>
            <h2 className={`mt-1 text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
              Riwayat Tagihan &amp; Pembayaran
            </h2>
          </div>
          <span className={`inline-flex items-center gap-1.5 text-xs ${isDark ? "text-slate-300" : "text-slate-500"}`}>
            <WalletCards size={14} />
            10 transaksi terbaru
          </span>
        </div>

        {actionNotice && (
          <p
            role="status"
            className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
              isDark
                ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
            <span>{actionNotice}</span>
          </p>
        )}

        {loading && !data ? (
          <TableSkeleton rows={4} columns={5} />
        ) : !data || data.riwayatPembayaran.length === 0 ? (
          <div
            className={`rounded-xl border border-dashed p-6 text-center text-xs ${
              isDark ? "border-white/15 text-slate-400" : "border-slate-300 text-slate-500"
            }`}
          >
            <Clock size={20} className="mx-auto mb-2 opacity-60" />
            Belum ada riwayat tagihan langganan untuk lembaga ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr
                  className={`border-b text-[11px] uppercase tracking-wider ${
                    isDark ? "border-white/10 text-slate-400" : "border-slate-200 text-slate-500"
                  }`}
                >
                  <th className="py-2.5 pr-4">Order ID &amp; Referensi</th>
                  <th className="py-2.5 pr-4">Paket</th>
                  <th className="py-2.5 pr-4">Nominal</th>
                  <th className="py-2.5 pr-4">Status</th>
                  <th className="py-2.5 pr-4">Tanggal</th>
                  <th className="py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-white/10 text-slate-200" : "divide-slate-200 text-slate-800"}`}>
                {data.riwayatPembayaran.map((item) => {
                  const badge = statusBadgeMeta(item.status, isDark);
                  const normalizedItemStatus = item.status.trim().toUpperCase();
                  const isPending =
                    normalizedItemStatus === "PENDING" ||
                    normalizedItemStatus === "MENUNGGU BAYAR" ||
                    normalizedItemStatus === "MENUNGGU_BAYAR";
                  const safeItemPaymentUrl = sanitizeHttpUrl(item.paymentUrl);
                  return (
                    <tr key={item.id}>
                      <td className="py-3 pr-4">
                        <p className="font-mono font-semibold">{item.merchantOrderId}</p>
                        <p className={`mt-0.5 font-mono text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.provider} ({item.environment.toUpperCase()})
                          {item.reference ? ` · Ref ${item.reference}` : ""}
                        </p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{item.planLabel}</p>
                        {item.paymentMethod && (
                          <p className={`text-[11px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                            Metode: {item.paymentMethod}
                          </p>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-bold">{formatRupiah(item.amount)}</td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className={`py-3 pr-4 text-[11px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        <p>{dateTimeFormat.format(new Date(item.createdAt))}</p>
                        {item.paidAt && (
                          <p className="text-emerald-600">Lunas: {dateTimeFormat.format(new Date(item.paidAt))}</p>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {isPending && safeItemPaymentUrl && (
                            <a
                              href={safeItemPaymentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-500"
                            >
                              Bayar <ExternalLink size={12} />
                            </a>
                          )}
                          {isPending &&
                            (confirmCancelOrderId === item.merchantOrderId ? (
                              <span
                                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${
                                  isDark
                                    ? "border-rose-400/40 bg-rose-500/20 text-rose-100"
                                    : "border-rose-300 bg-rose-50 text-rose-900"
                                }`}
                              >
                                <span className="font-semibold">Batalkan?</span>
                                <button
                                  type="button"
                                  disabled={cancelingOrderId === item.merchantOrderId}
                                  onClick={() => void handleCancelInvoice(item.merchantOrderId)}
                                  className="rounded bg-rose-600 px-2 py-0.5 font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                                >
                                  {cancelingOrderId === item.merchantOrderId ? "Menghapus..." : "Ya, Hapus"}
                                </button>
                                <button
                                  type="button"
                                  disabled={cancelingOrderId === item.merchantOrderId}
                                  onClick={() => setConfirmCancelOrderId(null)}
                                  className={`rounded border px-2 py-0.5 font-semibold ${
                                    isDark
                                      ? "border-white/20 bg-white/10 text-slate-100 hover:bg-white/20"
                                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  Tidak
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(cancelingOrderId)}
                                onClick={() => setConfirmCancelOrderId(item.merchantOrderId)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition disabled:opacity-50 ${
                                  isDark
                                    ? "border-rose-400/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                                    : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                }`}
                              >
                                <Trash2 size={12} />
                                Batalkan
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() =>
                              handlePrintInvoice({
                                orderId: item.merchantOrderId,
                                planLabel: item.planLabel,
                                amount: item.amount,
                              })
                            }
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${
                              isDark
                                ? "border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            <Printer size={12} />
                            Invoice
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
