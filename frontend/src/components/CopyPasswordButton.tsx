import { useState } from "react";

export function CopyPasswordButton({ password }: { password: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setMessage("Password disalin.");
    } catch (error) {
      console.error("Gagal menyalin password:", error);
      setMessage("Password tidak dapat disalin. Salin secara manual.");
    }
  }
  return <div className="mt-3"><button type="button" onClick={() => void copy()} className="rounded-lg border border-amber-500 px-3 py-2 font-bold text-amber-950">Salin Password ({password})</button>{message && <p role="status" className="mt-2">{message}</p>}</div>;
}
