import { useState } from "react";
import { RESERVED_SLUGS } from "./PublicSchoolPortal";

export function PortalLink({ slug }: { slug: string }) {
  const [notice, setNotice] = useState("");
  const portalUrl = (import.meta.env.VITE_PORTAL_URL || "https://pkbm.siput.id").replace(/\/+$/, "");
  const url = `${portalUrl}/${encodeURIComponent(slug)}`;
  if (RESERVED_SLUGS.has(slug)) return <div role="alert" className="dashboard-glass rounded-xl p-4 text-sm">Slug sekolah bertabrakan dengan rute sistem. Hubungi pengelola untuk bantuan portal.</div>;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setNotice("Link portal disalin."); }
    catch (error) { console.error("Gagal menyalin link portal:", error); setNotice("Link tidak dapat disalin. Salin alamat yang ditampilkan secara manual."); }
  }
  return <div className="dashboard-glass rounded-xl p-4 text-sm"><h3 className="font-bold">Link Portal &amp; PPDB Sekolah Anda</h3><p className="mt-2 break-all">{url}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="master-primary" onClick={() => void copy()}>Salin Link</button><a className="master-outline" href={url} target="_blank" rel="noopener noreferrer">Buka Halaman</a></div>{notice && <p role="status" className="mt-2">{notice}</p>}</div>;
}
