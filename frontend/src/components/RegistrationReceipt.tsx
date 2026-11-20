import { KopSurat } from "./KopSurat";
import type { SchoolProfile } from "./schoolProfile";

export type RegistrationData = {
  nama: string;
  noDaftar: string;
  nik?: string | null;
  nisn?: string | null;
  tempatLahir?: string | null;
  tanggalLahir?: string | null;
  jenisKelamin?: string | null;
  jenjang?: string | null;
  telepon?: string | null;
  asalSekolah?: string | null;
  email?: string | null;
  alamat?: string | null;
};

export function RegistrationReceipt({ profile, applicant }: { profile: SchoolProfile; applicant: RegistrationData }) {
  const date = applicant.tanggalLahir ? applicant.tanggalLahir.slice(0, 10).split("-").reverse().join("-") : "—";
  const fields: [string, string][] = [
    ["Nomor registrasi", applicant.noDaftar], ["Nama lengkap", applicant.nama], ["NIK", applicant.nik || "—"], ["NISN", applicant.nisn || "—"],
    ["Tempat / tanggal lahir", `${applicant.tempatLahir || "—"} / ${date}`],
    ["Jenis kelamin", applicant.jenisKelamin === "L" ? "Laki-laki" : applicant.jenisKelamin === "P" ? "Perempuan" : "—"],
    ["Paket / jenjang", applicant.jenjang || "—"], ["WhatsApp", applicant.telepon || "—"], ["Asal sekolah", applicant.asalSekolah || "—"],
    ...(applicant.email ? [["Email", applicant.email] as [string, string]] : []), ...(applicant.alamat ? [["Alamat", applicant.alamat] as [string, string]] : []),
  ];
  return <div className="print-area rounded-2xl bg-white p-5 text-slate-900 sm:p-8">
    <KopSurat profile={profile} />
    <h2 className="my-5 text-center text-lg font-bold uppercase">Bukti Pendaftaran PPDB</h2>
    <table className="w-full text-left text-sm"><tbody>{fields.map(([label, value]) => <tr key={label}><th className="w-40 py-1 pr-3 align-top font-semibold">{label}</th><td className="break-words py-1">: {value}</td></tr>)}</tbody></table>
    <p className="mt-4 text-xs">Pendaftaran menunggu pemeriksaan lembaga dan belum membuat akun siswa.</p>
    <div className="mt-10 grid grid-cols-2 gap-4 text-center text-sm"><div>Calon warga belajar<div className="mt-20 border-t border-slate-800 pt-1">{applicant.nama}</div></div><div>Ketua PKBM<div className="mt-20 border-t border-slate-800 pt-1">{profile.namaKetuaPkbm || "...................................."}</div></div></div>
  </div>;
}
