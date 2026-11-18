import { NavLink } from "react-router-dom";

export function LoginNavigation() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-center text-sm font-semibold ${isActive ? "bg-indigo-800 text-white" : "text-indigo-800 hover:bg-indigo-100"}`;
  return <nav aria-label="Pilihan login" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-white/50 p-1">
    <NavLink to="/login" end className={tabClass}>Admin Sekolah</NavLink>
    <NavLink to="/lms/login" className={tabClass}>Guru dan Siswa</NavLink>
  </nav>;
}
