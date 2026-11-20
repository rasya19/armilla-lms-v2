import { SchoolModal } from "./SchoolModal";
import type { PlanTier } from "../utils/planAccess";

export function UpgradePlanModal({ feature, required, school, onClose }: { feature: string; required: PlanTier; school: string; onClose: () => void }) {
  const message = `Halo, saya dari ${school}. Saya tertarik mengaktifkan paket ${required.toUpperCase()} untuk fitur ${feature}.`;
  return <SchoolModal title="Upgrade Paket" onClose={onClose}>
    <div className="space-y-4 text-sm">
      <p><strong>{feature}</strong> tersedia mulai paket <strong>{required.toUpperCase()}</strong>.</p>
      <p><strong>Reguler:</strong> PPDB, impor siswa, ekspor absensi, dan penempatan massal.</p>
      <p><strong>Pro:</strong> seluruh fitur Reguler serta Ujian &amp; CBT dan koreksi nilai.</p>
      <a className="master-primary inline-flex" href={`https://wa.me/6281918226387?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">Aktifkan Paket via WhatsApp</a>
    </div>
  </SchoolModal>;
}
