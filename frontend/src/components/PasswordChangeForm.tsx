import { useState } from "react";
import { describeFetchError, fetchWithTimeout } from "./fetchWithTimeout";

interface PasswordChangeFormProps {
  endpoint: string;
  onChanged: () => void;
  title?: string;
  description?: string;
  requireCurrentPassword?: boolean;
  className?: string;
  inputClassName?: string;
  buttonClassName?: string;
}

export function PasswordChangeForm({
  endpoint,
  onChanged,
  title = "Ganti password",
  description = "Masukkan password saat ini dan password baru.",
  requireCurrentPassword = true,
  className = "mt-6 rounded-xl border border-slate-200 bg-white p-5",
  inputClassName = "mt-2 w-full rounded-xl border border-slate-300 p-3",
  buttonClassName = "mt-4 rounded-xl bg-[#0c192d] px-4 py-2 text-sm font-bold text-white disabled:opacity-50",
}: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(requireCurrentPassword ? { currentPassword } : {}),
          password,
        }),
      });
      if (!response.ok) {
        let message = `Password belum dapat diganti (status ${response.status}).`;
        if (response.headers.get("content-type")?.includes("application/json")) {
          const result: unknown = await response.json();
          if (typeof result === "object" && result !== null && "error" in result && typeof result.error === "string") {
            message = result.error;
          }
        }
        throw new Error(message);
      }
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      onChanged();
    } catch (reason) {
      setError(describeFetchError(reason, "Password belum dapat diganti."));
    } finally {
      setBusy(false);
    }
  }

  return <section className={className}>
    <h2 className="font-bold">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      {requireCurrentPassword && <label className="block text-sm font-semibold">Password saat ini<input className={inputClassName} type="password" required maxLength={1024} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>}
      <label className="block text-sm font-semibold">Password baru<input className={inputClassName} type="password" required minLength={6} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Konfirmasi password baru<input className={inputClassName} type="password" required minLength={6} maxLength={1024} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <button disabled={busy} className={buttonClassName}>{busy ? "Menyimpan..." : "Simpan password"}</button>
    </form>
  </section>;
}
