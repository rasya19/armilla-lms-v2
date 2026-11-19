import { useEffect, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import { classMatchesPackage, ensureStandardClasses } from "./standardClasses";

const empty = {
  nama: "", nisn: "", nik: "", tempatLahir: "", tanggalLahir: "", jenisKelamin: "", jenjang: "", tanggalMasuk: "", jalurPendaftaran: "",
  email: "", telepon: "", namaAyah: "", teleponAyah: "", pekerjaanAyah: "", namaIbu: "", teleponIbu: "", pekerjaanIbu: "",
  namaWali: "", teleponWali: "", pekerjaanWali: "", alamatLengkap: "",
};
type StudentForm = typeof empty;
type ClassItem = { id: string; nama: string };
const paketOptions = ["Paket A", "Paket B", "Paket C"];
const fieldClass = "mt-1.5 block w-full min-w-0 rounded-xl border border-slate-300 bg-white/90 px-3 py-2.5 font-normal text-slate-900";
const labelClass = "block min-w-0 text-sm font-semibold text-slate-800";
const phonePattern = "[0-9\\x20\\x28\\x29\\x2b\\x2d]{6,30}";

function isoToDmy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseDmyToIso(dmy: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDmyInput(raw: string, previous: string): string {
  const deletingSlash = raw.length < previous.length && previous.endsWith("/") && !raw.endsWith("/");
  const sourceDigits = raw.replace(/\D/g, "").slice(0, 8);
  const digits = deletingSlash && sourceDigits.length > 0 ? sourceDigits.slice(0, -1) : sourceDigits;
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function DateDmyInput({
  label,
  valueIso,
  onChangeIso,
}: {
  label: string;
  valueIso: string;
  onChangeIso: (iso: string) => void;
}) {
  const [text, setText] = useState(() => isoToDmy(valueIso));
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const formatted = isoToDmy(valueIso);
    if (formatted && formatted !== text) {
      setText(formatted);
    } else if (!valueIso && parseDmyToIso(text)) {
      setText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIso]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (text.trim() === "" || parseDmyToIso(text) !== null) {
      el.setCustomValidity("");
    } else {
      el.setCustomValidity("Gunakan format tanggal DD/MM/YYYY yang valid (contoh: 17/08/2005).");
    }
  }, [text]);

  function handleTextChange(nextRaw: string) {
    const formatted = formatDmyInput(nextRaw, text);
    setText(formatted);
    if (formatted === "") {
      onChangeIso("");
      return;
    }
    const iso = parseDmyToIso(formatted);
    if (iso) {
      onChangeIso(iso);
    }
  }

  function openCalendar() {
    const picker = pickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") {
      try {
        picker.showPicker();
        return;
      } catch {
        // Fallback to focus/click below
      }
    }
    picker.click();
  }

  const invalid = text.trim() !== "" && text.length === 10 && parseDmyToIso(text) === null;

  return (
    <label className={labelClass}>
      <span>{label} <span className="font-normal text-slate-500">(DD/MM/YYYY)</span></span>
      <div className="relative mt-1.5">
        <input
          ref={textRef}
          type="text"
          inputMode="numeric"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          value={text}
          onChange={(event) => handleTextChange(event.target.value)}
          className={`block w-full min-w-0 rounded-xl border bg-white/90 py-2.5 pl-3 pr-10 font-normal text-slate-900 ${
            invalid ? "border-rose-400" : "border-slate-300"
          }`}
        />
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={valueIso}
          onChange={(event) => {
            const iso = event.target.value;
            onChangeIso(iso);
            setText(isoToDmy(iso));
          }}
          className="pointer-events-none absolute right-2 top-1/2 h-1 w-1 -translate-y-1/2 opacity-0"
        />
        <button
          type="button"
          onClick={openCalendar}
          aria-label={`Pilih ${label.toLowerCase()} dari kalender`}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-indigo-700"
        >
          <Calendar size={17} aria-hidden="true" />
        </button>
      </div>
      {invalid && (
        <span className="mt-1 block text-xs font-normal text-rose-700">
          Tanggal tidak valid. Gunakan DD/MM/YYYY (contoh: 17/08/2005).
        </span>
      )}
    </label>
  );
}

export function StudentEditor({ id, onCancel, onSaved, onBusyChange }: { id?: string; onCancel: () => void; onSaved: () => void; onBusyChange: (busy: boolean) => void }) {
  const [form, setForm] = useState<StudentForm | null>(id ? null : empty);
  const [kelas, setKelas] = useState<ClassItem[]>([]);
  const [kelasId, setKelasId] = useState("");
  const [originalKelasId, setOriginalKelasId] = useState<string | null>(null);
  const [studentActive, setStudentActive] = useState(true);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [classError, setClassError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<0 | 1>(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const originalPackage = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    ensureStandardClasses(controller.signal).then(() => fetch("/api/sekolah/kelas", { signal: controller.signal })).then(async (response) => {
      if (!response.ok) throw new Error("Daftar kelas belum dapat dimuat. Data siswa tetap dapat disimpan tanpa mengubah kelas.");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || !("kelas" in value) || !Array.isArray(value.kelas) || !value.kelas.every((item: unknown) => item !== null && typeof item === "object" && "id" in item && typeof item.id === "string" && "nama" in item && typeof item.nama === "string")) throw new Error("Respons daftar kelas tidak valid.");
      setKelas(value.kelas);
      setClassesLoaded(true);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Gagal memuat kelas:", failure);
      setClassError(failure instanceof Error ? failure.message : "Daftar kelas belum dapat dimuat.");
    });
    if (id) fetch(`/api/sekolah/siswa/${encodeURIComponent(id)}`, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Detail siswa belum dapat dimuat.");
      const value: unknown = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Respons server tidak valid.");
      const data = value as Record<string, unknown>;
      if ((data.kelasId !== null && typeof data.kelasId !== "string") || typeof data.status !== "string") throw new Error("Respons penempatan siswa tidak valid.");
      const next = { ...empty };
      for (const key of Object.keys(next) as (keyof StudentForm)[]) {
        const item = data[key];
        if (item !== null && typeof item !== "string") throw new Error("Respons detail siswa tidak lengkap atau tidak valid.");
        next[key] = typeof item === "string" ? (key === "tanggalLahir" || key === "tanggalMasuk" ? item.slice(0, 10) : item) : "";
      }
      const currentClass = typeof data.kelasId === "string" ? data.kelasId : null;
      originalPackage.current = next.jenjang;
      setOriginalKelasId(currentClass);
      setKelasId(currentClass ?? "");
      setStudentActive(data.status === "Aktif");
      setForm(next);
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Gagal memuat detail siswa:", failure);
      setError(failure instanceof Error ? failure.message : "Detail siswa belum dapat dimuat.");
    });
    return () => controller.abort();
  }, [id]);

  function change(key: keyof StudentForm, value: string) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }
  function input(key: keyof StudentForm, label: string, options: { required?: boolean; type?: string; pattern?: string; maxLength?: number; minLength?: number; full?: boolean } = {}) {
    if (!form) return null;
    return <label className={`${labelClass}${options.full ? " md:col-span-2" : ""}`}>{label}<input className={fieldClass} value={form[key]} onChange={(event) => change(key, event.target.value)} required={options.required} type={options.type ?? "text"} inputMode={key === "nisn" || key === "nik" ? "numeric" : undefined} pattern={options.pattern} maxLength={options.maxLength} minLength={options.minLength} /></label>;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || busy) return;
    if (kelasId && classesLoaded && (kelasId !== originalKelasId || form.jenjang !== originalPackage.current) && !kelas.some((item) => item.id === kelasId && classMatchesPackage(item.nama, form.jenjang))) {
      setTab(0); setError("Pilih kelas yang sesuai dengan paket atau pilih Belum ditempatkan."); return;
    }
    const element = event.currentTarget;
    if (!element.checkValidity()) {
      const invalid = element.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(":invalid");
      if (invalid) {
        setTab(invalid.closest("[data-tab]")?.getAttribute("data-tab") === "1" ? 1 : 0);
        window.requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      }
      setError("Periksa data wajib dan format pada form.");
      return;
    }
    setBusy(true); onBusyChange(true); setError("");
    try {
      const response = await fetch(id ? `/api/sekolah/siswa/${encodeURIComponent(id)}` : "/api/sekolah/siswa", {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { ...form, ...(kelasId !== (originalKelasId ?? "") ? { kelasId: kelasId || null, expectedKelasId: originalKelasId } : {}) } : { ...form, kelasId: kelasId || null }),
      });
      if (!response.ok) {
        let message = `Data belum dapat disimpan (status ${response.status}).`;
        if (response.headers.get("content-type")?.includes("application/json")) {
          const body: unknown = await response.json();
          if (body && typeof body === "object" && "error" in body && typeof body.error === "string") message = body.error;
        }
        throw new Error(message);
      }
      onSaved();
    } catch (failure) {
      console.error("Gagal menyimpan siswa:", failure);
      setError(failure instanceof TypeError ? "Koneksi terputus. Periksa daftar siswa sebelum mencoba lagi." : failure instanceof Error ? failure.message : "Data belum dapat disimpan.");
    } finally { setBusy(false); onBusyChange(false); }
  }

  return <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
    <div role="tablist" aria-label="Bagian data siswa" className="mx-5 mt-4 flex shrink-0 gap-2 rounded-2xl bg-slate-100/80 p-1 sm:mx-7">
      {["1. Data Siswa", "2. Data Orang Tua & Alamat"].map((label, index) => <button key={label} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab" id={`student-tab-${index}`} aria-controls={`student-panel-${index}`} aria-selected={tab === index} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index as 0 | 1)} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); const next = index === 0 ? 1 : 0; setTab(next); tabs.current[next]?.focus(); } }} className={`flex-1 rounded-xl px-2 py-2.5 text-xs font-bold transition sm:text-sm ${tab === index ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md" : "text-slate-600 hover:bg-white/80"}`}>{label}</button>)}
    </div>
    <div className="dashboard-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
      {form ? <>
        <div role="tabpanel" id="student-panel-0" aria-labelledby="student-tab-0" data-tab="0" hidden={tab !== 0}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {input("nama", "Nama Lengkap Siswa", { required: true, minLength: 2, maxLength: 200, full: true })}
            {input("nisn", "NISN (10 angka)", { required: true, pattern: "[0-9]{10}", maxLength: 10 })}
            {input("nik", "NIK (16 angka)", { pattern: "[0-9]{16}", maxLength: 16 })}
            {input("tempatLahir", "Tempat lahir", { maxLength: 200 })}
            <DateDmyInput label="Tanggal lahir" valueIso={form.tanggalLahir} onChangeIso={(iso) => change("tanggalLahir", iso)} />
            <label className={labelClass}>Jenjang / Paket<select className={fieldClass} value={form.jenjang} onChange={(event) => { change("jenjang", event.target.value); if (kelasId !== (originalKelasId ?? "")) setKelasId(""); }}><option value="">Pilih paket</option>{form.jenjang && !paketOptions.includes(form.jenjang) && <option value={form.jenjang}>{form.jenjang} (data sebelumnya)</option>}{paketOptions.map((paket) => <option key={paket} value={paket}>{paket}</option>)}</select></label>
            <label className={labelClass}>{id ? "Kelas siswa" : "Kelas awal (opsional)"}<select className={fieldClass} disabled={!classesLoaded || !studentActive} value={kelasId} onChange={(event) => setKelasId(event.target.value)}><option value="">Belum ditempatkan</option>{kelasId && !kelas.some((item) => item.id === kelasId && classMatchesPackage(item.nama, form.jenjang)) && <option value={kelasId} disabled>{kelas.find((item) => item.id === kelasId)?.nama ?? "Kelas tidak ditemukan"} (kelas sebelumnya)</option>}{kelas.filter((item) => classMatchesPackage(item.nama, form.jenjang)).map((item) => <option key={item.id} value={item.id}>{item.nama} ({item.id.slice(0, 8)})</option>)}</select></label>
            {input("email", "Email (opsional)", { type: "email", maxLength: 254 })}
            {input("telepon", "Nomor telepon / WhatsApp", { type: "tel", pattern: phonePattern, maxLength: 30 })}
            <label className={labelClass}>Jenis kelamin<select className={fieldClass} value={form.jenisKelamin} onChange={(event) => change("jenisKelamin", event.target.value)}><option value="">Tidak dipilih</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>
            <DateDmyInput label="Tanggal masuk" valueIso={form.tanggalMasuk} onChangeIso={(iso) => change("tanggalMasuk", iso)} />
            {input("jalurPendaftaran", "Jalur pendaftaran", { maxLength: 200 })}
          </div>
          {classError && <p role="alert" className="mt-4 text-sm text-amber-800">{classError}</p>}
          {classesLoaded && !form.jenjang && <p className="mt-4 text-sm text-slate-600">Pilih paket untuk menampilkan kelas yang sesuai.</p>}
          {classesLoaded && kelas.length === 0 && <p className="mt-4 text-sm text-slate-600">Belum ada kelas. Tambahkan kelas di Manajemen Kelas terlebih dahulu.</p>}
          {id && !studentActive && <p className="mt-4 text-sm text-slate-600">Hanya siswa aktif yang dapat dipindahkan kelas.</p>}
          {id && studentActive && <p className="mt-4 text-sm text-slate-600">Perpindahan mengganti kelas sebelumnya tanpa menyimpan riwayat.</p>}
          {!id && <p className="mt-4 text-sm text-slate-600">Akun siswa dibuat terpisah setelah data disimpan.</p>}
        </div>
        <div role="tabpanel" id="student-panel-1" aria-labelledby="student-tab-1" data-tab="1" hidden={tab !== 1}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(["Ayah", "Ibu", "Wali"] as const).map((person) => <fieldset key={person} className="space-y-3 rounded-2xl border border-white/80 bg-blue-50/60 p-4"><legend className="px-1 text-sm font-bold text-indigo-800">Data {person}{person === "Wali" && " (opsional)"}</legend>
              {input(`nama${person}`, `Nama ${person.toLowerCase()}`, { maxLength: 200 })}
              {input(`telepon${person}`, `No. HP ${person.toLowerCase()}`, { type: "tel", pattern: phonePattern, maxLength: 30 })}
              {input(`pekerjaan${person}`, `Pekerjaan ${person.toLowerCase()}`, { maxLength: 200 })}
            </fieldset>)}
            <label className={`${labelClass} md:col-span-2`}>Alamat lengkap<textarea rows={2} className={fieldClass} maxLength={500} value={form.alamatLengkap} onChange={(event) => change("alamatLengkap", event.target.value)} /></label>
          </div>
        </div>
      </> : !error && <p className="text-sm text-slate-600">Memuat detail siswa...</p>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 bg-white/80 px-5 py-4 sm:px-7">
      <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 disabled:opacity-50">Batal</button>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!form || busy} onClick={() => setTab(tab === 0 ? 1 : 0)} className="rounded-xl border border-indigo-200 px-4 py-2.5 text-sm font-bold text-indigo-700 disabled:opacity-50">{tab === 0 ? "Lanjut ke Data Orang Tua →" : "← Data Siswa"}</button>
        <button type="submit" disabled={!form || busy} className="master-primary disabled:opacity-50">{busy ? "Menyimpan..." : id ? "Simpan perubahan" : "Simpan Siswa"}</button>
      </div>
    </div>
  </form>;
}
