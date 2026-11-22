import { ChevronDown } from "lucide-react";

export type LoginRole = "ADMIN" | "GURU" | "SISWA";

export function LoginNavigation({
  value,
  onChange,
  disabled = false,
}: {
  value: LoginRole;
  onChange: (role: LoginRole) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5">
      <label htmlFor="login-role-select" className="block text-sm font-semibold text-slate-800">
        Masuk sebagai
      </label>
      <div className="relative mt-2">
        <select
          id="login-role-select"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value as LoginRole)}
          className="glass-input w-full appearance-none rounded-xl py-3 pl-4 pr-11 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          <option value="ADMIN">Admin Sekolah</option>
          <option value="GURU">Guru / Tutor</option>
          <option value="SISWA">Siswa / Warga Belajar</option>
        </select>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500"
        />
      </div>
    </div>
  );
}
