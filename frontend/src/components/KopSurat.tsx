import type { SchoolProfile } from "./schoolProfile";

export function buildKopSuratProfile(
  kopSurat?: Partial<SchoolProfile> | null,
  fallback?: {
    nama: string;
    npsn?: string | null;
    alamat?: string | null;
    kabupatenKota?: string | null;
    kepalaSekolah?: string | null;
    logoUrl?: string | null;
  },
): SchoolProfile {
  return {
    nama: kopSurat?.nama?.trim() || fallback?.nama?.trim() || "PKBM",
    npsn: kopSurat?.npsn ?? fallback?.npsn ?? null,
    namaYayasan: kopSurat?.namaYayasan ?? null,
    skIzinOperasional: kopSurat?.skIzinOperasional ?? null,
    alamatLengkap: kopSurat?.alamatLengkap ?? fallback?.alamat ?? null,
    kabupatenKota: kopSurat?.kabupatenKota ?? fallback?.kabupatenKota ?? null,
    provinsi: kopSurat?.provinsi ?? null,
    teleponWa: kopSurat?.teleponWa ?? null,
    emailSekolah: kopSurat?.emailSekolah ?? null,
    websiteSekolah: kopSurat?.websiteSekolah ?? null,
    logoUrl: kopSurat?.logoUrl ?? fallback?.logoUrl ?? null,
    logoYayasanUrl: kopSurat?.logoYayasanUrl ?? null,
    namaKetuaPkbm: kopSurat?.namaKetuaPkbm ?? fallback?.kepalaSekolah ?? null,
  };
}

function escapeHtmlText(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch),
  );
}

/**
 * Generates printable HTML markup for the official institutional Kop Surat
 * (used by printable exam sheets, invoices, and standalone A4 print windows).
 */
export function renderKopSuratHtml(profile: SchoolProfile): string {
  const address = [profile.alamatLengkap, profile.kabupatenKota, profile.provinsi].filter(Boolean).join(", ");
  const contacts = [
    profile.teleponWa ? `Telp/WA: ${profile.teleponWa}` : "",
    profile.emailSekolah ? `Email: ${profile.emailSekolah}` : "",
    profile.websiteSekolah || "",
  ]
    .filter(Boolean)
    .join(" | ");
  const metaParts = [
    profile.npsn ? `NPSN: ${profile.npsn}` : "",
    profile.skIzinOperasional ? `Izin Operasional: ${profile.skIzinOperasional}` : "",
  ].filter(Boolean);

  const logoMarkup = profile.logoUrl
    ? `<img src="${escapeHtmlText(profile.logoUrl)}" alt="Logo ${escapeHtmlText(profile.nama)}" style="width:84px;height:84px;object-fit:contain;" />`
    : `<div style="width:72px;height:72px;border-radius:999px;border:2px solid #1e293b;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:#0f172a;">${escapeHtmlText(profile.nama.charAt(0).toUpperCase())}</div>`;

  const rightLogoMarkup = profile.logoYayasanUrl
    ? `<div style="width:92px;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><img src="${escapeHtmlText(profile.logoYayasanUrl)}" alt="Logo Yayasan" style="width:84px;height:84px;object-fit:contain;" /></div>`
    : `<div style="width:92px;flex-shrink:0;"></div>`;

  return `<div style="border-bottom:4px double #0f172a;padding:0 6px 12px 6px;margin-bottom:16px;">
    <div style="display:grid;grid-template-columns:92px 1fr 92px;align-items:center;gap:18px;width:100%;">
      <div style="width:92px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">${logoMarkup}</div>
      <div style="text-align:center;min-width:0;">
        ${profile.namaYayasan ? `<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#334155;">${escapeHtmlText(profile.namaYayasan)}</div>` : ""}
        <div style="font-size:19px;font-weight:900;text-transform:uppercase;letter-spacing:0.02em;color:#0f172a;margin-top:2px;">${escapeHtmlText(profile.nama)}</div>
        ${metaParts.length > 0 ? `<div style="font-size:11px;color:#334155;margin-top:2px;">${escapeHtmlText(metaParts.join(" | "))}</div>` : ""}
        ${address ? `<div style="font-size:11px;color:#334155;margin-top:1px;">${escapeHtmlText(address)}</div>` : ""}
        ${contacts ? `<div style="font-size:10.5px;color:#475569;margin-top:1px;">${escapeHtmlText(contacts)}</div>` : ""}
      </div>
      ${rightLogoMarkup}
    </div>
  </div>`;
}

export function KopSurat({ profile }: { profile: SchoolProfile }) {
  const address = [profile.alamatLengkap, profile.kabupatenKota, profile.provinsi].filter(Boolean).join(", ");
  const contacts = [
    profile.teleponWa && `Telp/WA: ${profile.teleponWa}`,
    profile.emailSekolah && `Email: ${profile.emailSekolah}`,
    profile.websiteSekolah,
  ]
    .filter(Boolean)
    .join(" | ");
  const metaLine = [
    profile.npsn && `NPSN: ${profile.npsn}`,
    profile.skIzinOperasional && `Izin Operasional: ${profile.skIzinOperasional}`,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="kop-surat w-full border-b-4 border-double border-slate-900 bg-white px-2 pb-3.5 text-slate-900">
      <div className="grid w-full grid-cols-[80px_1fr_80px] items-center gap-4 sm:grid-cols-[96px_1fr_96px] sm:gap-6">
        <div className="flex h-20 w-20 items-center justify-center sm:h-24 sm:w-24">
          {profile.logoUrl ? (
            <img
              src={profile.logoUrl}
              alt={`Logo ${profile.nama}`}
              className="h-20 w-20 object-contain sm:h-24 sm:w-24"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-700 text-2xl font-black text-slate-900 sm:h-20 sm:w-20">
              {profile.nama.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 text-center">
          {profile.namaYayasan && (
            <p className="text-xs font-bold uppercase tracking-wider text-slate-700 sm:text-sm">
              {profile.namaYayasan}
            </p>
          )}
          <p className="text-base font-black uppercase tracking-tight text-slate-950 sm:text-xl">
            {profile.nama}
          </p>
          {metaLine && <p className="mt-0.5 text-[11px] font-medium text-slate-700">{metaLine}</p>}
          {address && <p className="text-[11px] text-slate-700">{address}</p>}
          {contacts && <p className="break-words text-[10.5px] text-slate-600">{contacts}</p>}
        </div>
        <div className="flex h-20 w-20 items-center justify-center justify-self-end sm:h-24 sm:w-24">
          {profile.logoYayasanUrl ? (
            <img
              src={profile.logoYayasanUrl}
              alt={`Logo ${profile.namaYayasan || "Yayasan"}`}
              className="h-20 w-20 object-contain sm:h-24 sm:w-24"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span aria-hidden="true" className="block h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
