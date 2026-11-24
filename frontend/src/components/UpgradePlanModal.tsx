import { useState } from "react";
import { Check, CreditCard, ExternalLink, Loader2, MessageCircle, Printer } from "lucide-react";
import { SchoolModal } from "./SchoolModal";
import { SUBSCRIPTION_PLANS, type PlanSlug } from "./subscriptionPlans";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";
import type { PlanTier } from "../utils/planAccess";

const SALES_WA = (import.meta.env.VITE_SALES_WA as string | undefined)?.replace(/[^0-9]/g, "") || "6281918226387";

export function UpgradePlanModal({
  feature,
  required,
  school,
  onClose,
}: {
  feature: string;
  required: PlanTier;
  school: string;
  onClose: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PlanSlug>(required === "pro" ? "pro" : "reguler");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkoutInfo, setCheckoutInfo] = useState<{
    orderId: string;
    planLabel: string;
    amount: number;
    paymentUrl: string | null;
    message: string;
  } | null>(null);

  const activePlan = SUBSCRIPTION_PLANS.find((p) => p.slug === selectedPlan) ?? SUBSCRIPTION_PLANS[2];
  const waMessage = checkoutInfo
    ? `Halo, saya dari ${school}. Saya ingin konfirmasi pembayaran ${checkoutInfo.planLabel} (Order ID: ${checkoutInfo.orderId}, nominal Rp ${checkoutInfo.amount.toLocaleString("id-ID")}).`
    : `Halo, saya dari ${school}. Saya tertarik mengaktifkan ${activePlan.name} (${activePlan.annualPriceLabel}) untuk fitur ${feature}.`;

  async function handleCheckout() {
    if (busy) return;
    setBusy(true);
    setError("");
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
        planLabel?: string;
        amount?: number;
        paymentUrl?: string | null;
        message?: string;
      } | null;
      if (!res.ok || !body?.orderId) {
        throw new Error(body?.error || "Checkout langganan belum dapat dibuat.");
      }
      setCheckoutInfo({
        orderId: body.orderId,
        planLabel: body.planLabel || activePlan.name,
        amount: body.amount ?? activePlan.annualPrice,
        paymentUrl: body.paymentUrl ?? null,
        message: body.message || "Tagihan berhasil dibuat.",
      });
      if (body.paymentUrl) {
        window.open(body.paymentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (failure) {
      setError(describeFetchError(failure, "Checkout otomatis belum tersedia. Gunakan konfirmasi WhatsApp di bawah."));
    } finally {
      setBusy(false);
    }
  }

  function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
  }

  function handlePrintInvoice() {
    if (!checkoutInfo) return;
    const win = window.open("", "_blank", "width=820,height=900");
    if (!win) return;
    const todayStr = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(checkoutInfo.orderId)}</title><style>body{font-family:system-ui,-apple-system,sans-serif;color:#0f172a;padding:32px;max-width:760px;margin:auto}h1{margin:0;font-size:22px}.muted{color:#475569;font-size:12px}.box{border:1px solid #cbd5e1;border-radius:12px;padding:16px;margin-top:20px}table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}.right{text-align:right}.total{font-size:16px;font-weight:800;background:#eef2ff}@media print{button{display:none}}</style></head><body><div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:16px"><div><h1>INVOICE LANGGANAN LMS</h1><p class="muted">Tagihan Resmi Aktivasi / Perpanjangan Layanan Platform Pendidikan</p></div><div class="right"><p style="margin:0;font-weight:700;font-family:monospace">${escapeHtml(checkoutInfo.orderId)}</p><p class="muted" style="margin:4px 0 0">Tanggal: ${escapeHtml(todayStr)}</p></div></div><div class="box"><p style="margin:0;font-size:12px;color:#64748b">Ditagihkan Kepada:</p><p style="margin:4px 0 0;font-size:16px;font-weight:700">${escapeHtml(school)}</p></div><table><thead><tr><th>Deskripsi Layanan</th><th class="right">Durasi</th><th class="right">Nominal</th></tr></thead><tbody><tr><td><strong>${escapeHtml(checkoutInfo.planLabel)}</strong><br><span class="muted">Akses penuh portal LMS multi-tenant, E-Modul, CBT &amp; E-Raport</span></td><td class="right">12 Bulan (365 Hari)</td><td class="right">Rp ${checkoutInfo.amount.toLocaleString("id-ID")}</td></tr><tr class="total"><td colspan="2" class="right">Total Tagihan</td><td class="right">Rp ${checkoutInfo.amount.toLocaleString("id-ID")}</td></tr></tbody></table><p class="muted" style="margin-top:20px">Dokumen ini dicetak secara elektronik dan sah digunakan untuk administrasi pembayaran lembaga / dana BOP / BOS.</p><button onclick="window.print()" style="margin-top:16px;padding:10px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;font-weight:700;cursor:pointer">Cetak / Simpan sebagai PDF</button></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return (
    <SchoolModal title="Aktivasi / Upgrade Langganan" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-xs leading-5 text-slate-600">
          Fitur <strong>{feature}</strong> tersedia mulai paket <strong>{required.toUpperCase()}</strong>. Pilih paket tahunan di bawah untuk pembayaran instan QRIS / Virtual Account atau konfirmasi WhatsApp.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const active = selectedPlan === plan.slug;
            return (
              <button
                key={plan.slug}
                type="button"
                onClick={() => {
                  setSelectedPlan(plan.slug);
                  setCheckoutInfo(null);
                }}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/25"
                    : "border-slate-200 bg-white hover:border-indigo-300"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-extrabold text-slate-900">{plan.name}</span>
                  {active && <Check size={14} className="text-indigo-600" />}
                </div>
                <p className="mt-1 text-sm font-black text-indigo-800">{plan.annualPriceLabel}</p>
                <p className="text-[11px] text-slate-500">{plan.price} {plan.period}</p>
              </button>
            );
          })}
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800">
            {error}
          </p>
        )}

        {checkoutInfo && (
          <div role="status" className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
            <p className="font-bold">{checkoutInfo.message}</p>
            <p className="font-mono text-[11px]">
              Order ID: <strong>{checkoutInfo.orderId}</strong> · Rp {checkoutInfo.amount.toLocaleString("id-ID")}
            </p>
            <div className="flex flex-wrap gap-2">
              {checkoutInfo.paymentUrl && (
                <a
                  href={checkoutInfo.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-500"
                >
                  Buka Halaman Pembayaran QRIS / VA <ExternalLink size={13} />
                </a>
              )}
              <button
                type="button"
                onClick={handlePrintInvoice}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-800 hover:bg-slate-50"
              >
                <Printer size={13} />
                Cetak / Simpan Invoice PDF
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCheckout()}
            className="master-primary inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-extrabold disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            {busy ? "Membuat Tagihan..." : "Bayar QRIS / Virtual Account"}
          </button>
          <a
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
            href={`https://wa.me/${SALES_WA}?text=${encodeURIComponent(waMessage)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle size={14} />
            Konfirmasi via WhatsApp
          </a>
        </div>
      </div>
    </SchoolModal>
  );
}
