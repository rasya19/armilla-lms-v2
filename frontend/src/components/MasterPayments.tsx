import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { CardGridSkeleton, TableSkeleton } from "./DashboardUI";
import { describeFetchError, fetchWithTimeout, isCallerAborted } from "./fetchWithTimeout";

type PaymentConfig = {
  provider: string;
  configured: boolean;
  merchantCode: string | null;
  environment: "sandbox" | "production";
  siteUrl: string;
  callbackUrl: string;
};

type PaymentSummary = {
  totalTransactions: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
  totalRevenue: number;
};

type PaymentItem = {
  id: string;
  merchantOrderId: string;
  reference: string | null;
  publisherOrderId: string | null;
  provider: string;
  environment: string;
  plan: string;
  planLabel: string;
  durationDays: number;
  amount: number;
  paymentMethod: string | null;
  paymentUrl: string | null;
  status: string;
  resultCode: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  settlementDate: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  sekolah: {
    id: string;
    nama: string;
    slug: string;
    npsn: string | null;
    plan: string;
    status: string;
    expiresAt: string | null;
  };
};

type PaymentResponse = {
  config: PaymentConfig;
  summary: PaymentSummary;
  items: PaymentItem[];
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
};

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateOnlyFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function statusMeta(status: string): { label: string; badgeClass: string } {
  switch (status.toUpperCase()) {
    case "PAID":
      return { label: "LUNAS", badgeClass: "master-badge-green" };
    case "PENDING":
      return { label: "MENUNGGU", badgeClass: "master-badge-blue" };
    case "EXPIRED":
      return { label: "KEDALUWARSA", badgeClass: "master-badge-rose" };
    default:
      return { label: "GAGAL", badgeClass: "master-badge-rose" };
  }
}

export function MasterPayments() {
  const [data, setData] = useState<PaymentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [envFilter, setEnvFilter] = useState("ALL");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadPayments = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "25",
        });
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        if (envFilter !== "ALL") params.set("env", envFilter);
        if (query.trim()) params.set("q", query.trim());

        const res = await fetchWithTimeout(`/api/master/pembayaran?${params.toString()}`, { signal });
        const body = (await res.json().catch(() => null)) as (PaymentResponse & { error?: string }) | null;
        if (!res.ok || !body || !Array.isArray(body.items)) {
          throw new Error(
            res.status === 401
              ? "Sesi berakhir. Silakan masuk kembali."
              : body?.error || "Gagal memuat data pembayaran langganan.",
          );
        }
        setData(body);
      } catch (failure) {
        if (!isCallerAborted(failure, signal)) {
          setError(describeFetchError(failure, "Data pembayaran tidak tersedia."));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, statusFilter, envFilter, query],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadPayments(controller.signal);
    return () => controller.abort();
  }, [loadPayments]);

  async function handleSyncStatus(item: PaymentItem) {
    if (syncingId) return;
    setSyncingId(item.id);
    setNotice("");
    setError("");
    try {
      const res = await fetchWithTimeout(`/api/master/pembayaran/${encodeURIComponent(item.id)}/cek-status`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
      if (!res.ok) {
        throw new Error(body?.error || "Gagal memeriksa status pembayaran ke Duitku.");
      }
      setNotice(`${item.merchantOrderId}: ${body?.message || "Status diperiksa."}`);
      await loadPayments();
    } catch (failure) {
      setError(describeFetchError(failure, "Pemeriksaan status Duitku gagal."));
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="master-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="master-eyebrow">INTEGRASI PAYMENT GATEWAY</p>
            <h2 className="mt-2 text-xl font-bold text-white">Duitku — SIPUT PKBM</h2>
            <p className="mt-1 text-sm text-slate-400">
              Pemantauan tagihan langganan tenant lembaga kesetaraan dan sinkronisasi callback otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPayments()}
            disabled={loading}
            className="master-outline inline-flex items-center gap-2 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Muat Ulang
          </button>
        </div>

        {data?.config && (
          <div className="mt-5 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-slate-400">Status Koneksi</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className={`master-badge ${data.config.configured ? "master-badge-green" : "master-badge-rose"}`}>
                  {data.config.configured ? "TERHUBUNG" : "BELUM DIKONFIGURASI"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-slate-400">Merchant Code &amp; Mode</p>
              <p className="mt-1.5 font-mono font-bold text-white">
                {data.config.merchantCode || "—"} ·{" "}
                <span className={data.config.environment === "production" ? "text-emerald-300" : "text-amber-300"}>
                  {data.config.environment.toUpperCase()}
                </span>
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-slate-400">Endpoint Callback Duitku</p>
              <p className="mt-1.5 break-all font-mono text-indigo-200">{data.config.callbackUrl}</p>
            </div>
          </div>
        )}

        {!data && loading ? (
          <div className="mt-5">
            <CardGridSkeleton count={4} columns={4} />
          </div>
        ) : (
          data && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <div className="flex items-center justify-between text-xs text-emerald-200">
                  <span>Total Pendapatan Lunas</span>
                  <WalletCards size={16} />
                </div>
                <p className="mt-2 text-xl font-extrabold text-white">{formatRupiah(data.summary.totalRevenue)}</p>
                <p className="mt-1 text-[11px] text-emerald-200/80">{data.summary.paidCount} transaksi selesai</p>
              </div>
              <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
                <div className="flex items-center justify-between text-xs text-indigo-200">
                  <span>Menunggu Pembayaran</span>
                  <Clock size={16} />
                </div>
                <p className="mt-2 text-xl font-extrabold text-white">{data.summary.pendingCount}</p>
                <p className="mt-1 text-[11px] text-indigo-200/80">Invoice aktif belum dibayar</p>
              </div>
              <div className="rounded-xl border border-emerald-400/20 bg-white/5 p-4">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Total Transaksi</span>
                  <CreditCard size={16} />
                </div>
                <p className="mt-2 text-xl font-extrabold text-white">{data.summary.totalTransactions}</p>
                <p className="mt-1 text-[11px] text-slate-400">Seluruh riwayat checkout tenant</p>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4">
                <div className="flex items-center justify-between text-xs text-rose-200">
                  <span>Gagal / Kedaluwarsa</span>
                  <XCircle size={16} />
                </div>
                <p className="mt-2 text-xl font-extrabold text-white">{data.summary.failedCount}</p>
                <p className="mt-1 text-[11px] text-rose-200/80">Transaksi batal atau lewat batas</p>
              </div>
            </div>
          )
        )}
      </section>

      <section className="master-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="master-eyebrow">RIWAYAT TRANSAKSI TENANT</p>
            <h3 className="mt-1 text-lg font-bold text-white">Semua Pembayaran Langganan</h3>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(queryInput);
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label className="master-search">
              <Search size={15} />
              <span className="sr-only">Cari transaksi atau lembaga</span>
              <input
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Cari PKBM, NPSN, Order ID..."
              />
            </label>
            <select
              aria-label="Filter status pembayaran"
              value={statusFilter}
              onChange={(event) => {
                setPage(1);
                setStatusFilter(event.target.value);
              }}
              className="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-slate-200"
            >
              <option value="ALL">Semua Status</option>
              <option value="PAID">Lunas</option>
              <option value="PENDING">Menunggu</option>
              <option value="FAILED">Gagal</option>
              <option value="EXPIRED">Kedaluwarsa</option>
            </select>
            <select
              aria-label="Filter mode environment"
              value={envFilter}
              onChange={(event) => {
                setPage(1);
                setEnvFilter(event.target.value);
              }}
              className="rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-slate-200"
            >
              <option value="ALL">Semua Mode</option>
              <option value="production">Production</option>
              <option value="sandbox">Sandbox</option>
            </select>
            <button type="submit" className="master-primary px-3 py-2 text-xs">
              Filter
            </button>
          </form>
        </div>

        {notice && (
          <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
            <CheckCircle2 size={15} />
            <span>{notice}</span>
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {error}
          </p>
        )}

        {loading && !data ? (
          <div className="mt-5">
            <TableSkeleton rows={5} columns={6} />
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="master-empty mt-6">
            Belum ada transaksi pembayaran yang cocok dengan filter saat ini.
          </p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-400">
                    <th className="py-3 pr-4">Lembaga (Tenant)</th>
                    <th className="py-3 pr-4">Order ID &amp; Referensi</th>
                    <th className="py-3 pr-4">Paket &amp; Nominal</th>
                    <th className="py-3 pr-4">Status</th>
                    <th className="py-3 pr-4">Waktu</th>
                    <th className="py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-slate-200">
                  {data.items.map((item) => {
                    const meta = statusMeta(item.status);
                    return (
                      <tr key={item.id} className="align-top hover:bg-white/[0.02]">
                        <td className="py-3.5 pr-4">
                          <p className="font-bold text-white">{item.sekolah.nama}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {item.sekolah.slug} {item.sekolah.npsn ? `· NPSN ${item.sekolah.npsn}` : ""}
                          </p>
                          <p className="mt-1 text-[11px] text-indigo-300">
                            Aktif: {item.sekolah.plan.toUpperCase()}
                            {item.sekolah.expiresAt
                              ? ` s.d. ${dateOnlyFormat.format(new Date(item.sekolah.expiresAt))}`
                              : ""}
                          </p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="font-mono font-semibold text-white">{item.merchantOrderId}</p>
                          <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                            Ref: {item.reference || "—"}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {item.provider} ·{" "}
                            <span className={item.environment === "production" ? "text-emerald-300" : "text-amber-300"}>
                              {item.environment.toUpperCase()}
                            </span>
                            {item.paymentMethod ? ` · Metode ${item.paymentMethod}` : ""}
                          </p>
                        </td>
                        <td className="py-3.5 pr-4">
                          <p className="font-bold text-white">{formatRupiah(item.amount)}</p>
                          <p className="mt-0.5 text-[11px] text-slate-300">{item.planLabel}</p>
                          {item.customerName && (
                            <p className="mt-0.5 text-[11px] text-slate-400">PIC: {item.customerName}</p>
                          )}
                        </td>
                        <td className="py-3.5 pr-4">
                          <span className={`master-badge ${meta.badgeClass}`}>{meta.label}</span>
                          {item.resultCode && (
                            <p className="mt-1 font-mono text-[10px] text-slate-400">Kode: {item.resultCode}</p>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 text-[11px] text-slate-300">
                          <p>Dibuat: {dateTimeFormat.format(new Date(item.createdAt))}</p>
                          {item.paidAt && (
                            <p className="mt-1 text-emerald-300">
                              Lunas: {dateTimeFormat.format(new Date(item.paidAt))}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 text-right">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {item.status === "PENDING" && item.provider === "DUITKU" && (
                              <button
                                type="button"
                                disabled={syncingId === item.id}
                                onClick={() => void handleSyncStatus(item)}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-400/35 bg-indigo-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-50"
                              >
                                <ShieldCheck size={13} />
                                {syncingId === item.id ? "Memeriksa..." : "Cek Status"}
                              </button>
                            )}
                            {item.paymentUrl && item.status === "PENDING" && (
                              <a
                                href={item.paymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
                              >
                                Invoice <ExternalLink size={12} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
              <span>
                Halaman {data.page} · Menampilkan {data.items.length} dari {data.total} transaksi
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="master-outline px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  ← Sebelumnya
                </button>
                <button
                  type="button"
                  disabled={!data.hasNext || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="master-outline px-3 py-1.5 text-xs disabled:opacity-40"
                >
                  Berikutnya →
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
