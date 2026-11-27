export type StudentLoginStatus = "AKTIF" | "PERNAH" | "BELUM";

export function formatLoginTimestamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

export function normalizeIndonesianWaPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 16) return null;
  if (digits.startsWith("0")) return `62${digits.slice(1)}`;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("8")) return `62${digits}`;
  return digits;
}

export function buildStudentReminderMessage(params: {
  nama: string;
  kelasNama?: string | null;
  statusLogin?: StudentLoginStatus;
  senderRole: "Admin" | "Guru";
  portalUrl?: string;
}): string {
  const kelasPart = params.kelasNama ? ` (${params.kelasNama})` : "";
  const urlPart = params.portalUrl ? `\nTautan portal: ${params.portalUrl}` : "";
  if (params.statusLogin === "PERNAH") {
    return (
      `Halo ${params.nama}${kelasPart}, salam dari ${params.senderRole} PKBM.\n` +
      `Kami memantau akun LMS Anda sedang tidak aktif / belum login kembali. ` +
      `Mohon segera masuk ke Portal Siswa untuk mengecek materi, tugas, dan jadwal ujian terbaru ya.${urlPart}\n` +
      `Jika lupa kata sandi, silakan hubungi ${params.senderRole} agar dibantu reset. Terima kasih.`
    );
  }
  return (
    `Halo ${params.nama}${kelasPart}, salam dari ${params.senderRole} PKBM.\n` +
    `Kami memantau Anda belum pernah login ke Portal Siswa LMS. ` +
    `Mohon segera masuk menggunakan NISN dan kata sandi Anda untuk mengikuti pembelajaran dan mengecek tugas/materi.${urlPart}\n` +
    `Jika belum memiliki akun atau mengalami kendala login, silakan hubungi ${params.senderRole}. Terima kasih.`
  );
}

export function buildStudentReminderWaUrl(phone: string | null | undefined, message: string): string | null {
  const wa = normalizeIndonesianWaPhone(phone);
  if (!wa) return null;
  return `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
}
