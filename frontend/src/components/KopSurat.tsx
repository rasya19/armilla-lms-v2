import type { SchoolProfile } from "./schoolProfile";

export function KopSurat({ profile }: { profile: SchoolProfile }) {
  const address = [profile.alamatLengkap, profile.kabupatenKota, profile.provinsi].filter(Boolean).join(", ");
  const contacts = [profile.teleponWa && `Telp/WA: ${profile.teleponWa}`, profile.emailSekolah && `Email: ${profile.emailSekolah}`, profile.websiteSekolah].filter(Boolean).join(" | ");
  return <div className="kop-surat flex items-center gap-3 border-b-4 border-double border-slate-900 bg-white pb-4 text-slate-900">
    <div className="flex h-20 w-20 shrink-0 items-center justify-center">
      {profile.logoUrl ? <img src={profile.logoUrl} alt={`Logo ${profile.nama}`} className="h-20 w-20 object-contain" /> : <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-slate-700 text-2xl font-black">{profile.nama.charAt(0).toUpperCase()}</span>}
    </div>
    <div className="min-w-0 flex-1 text-center">
      {profile.namaYayasan && <p className="text-sm font-bold uppercase">{profile.namaYayasan}</p>}
      <p className="text-lg font-black uppercase sm:text-xl">{profile.nama}</p>
      <p className="text-xs">NPSN: {profile.npsn || "—"} | Izin Operasional: {profile.skIzinOperasional || "—"}</p>
      {address && <p className="text-xs">{address}</p>}
      {contacts && <p className="break-words text-xs">{contacts}</p>}
    </div>
    <div aria-hidden="true" className="hidden w-20 shrink-0 sm:block" />
  </div>;
}
