export type LoginAccount = { id: string; passwordHash: string; peran: "MASTER_ADMIN" | "ADMIN" | "GURU" | "SISWA"; sekolahId: string | null };
export type LockedAccount = { passwordHash: string; aktif: boolean; peran: string; sekolahId: string | null };

export function isLoginAccountUnchanged(account: LoginAccount, current: LockedAccount | undefined): boolean {
  return !!current && current.aktif && current.passwordHash === account.passwordHash && current.peran === account.peran && current.sekolahId === account.sekolahId;
}
