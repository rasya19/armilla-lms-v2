export const TRIAL_DURATION_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function previewTrialEndDate(startDate = new Date(), days = TRIAL_DURATION_DAYS): Date {
  return new Date(startDate.getTime() + days * DAY_MS);
}

export function formatEndDateId(value: string | Date | null | undefined, includeTime = false): string {
  if (!value) return "—";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function formatDateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function getTrialCountdown(expiresAt: string | null | undefined, now = new Date()): {
  hasExpiry: boolean;
  expired: boolean;
  daysLeft: number;
  hoursLeft: number;
  formattedDate: string;
} {
  if (!expiresAt) {
    return {
      hasExpiry: false,
      expired: false,
      daysLeft: 0,
      hoursLeft: 0,
      formattedDate: "Tanpa batas waktu",
    };
  }
  const end = new Date(expiresAt);
  if (Number.isNaN(end.getTime())) {
    return {
      hasExpiry: false,
      expired: false,
      daysLeft: 0,
      hoursLeft: 0,
      formattedDate: "—",
    };
  }
  const diffMs = end.getTime() - now.getTime();
  const expired = diffMs <= 0;
  const daysLeft = expired ? 0 : Math.ceil(diffMs / DAY_MS);
  const hoursLeft = expired ? 0 : Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  return {
    hasExpiry: true,
    expired,
    daysLeft,
    hoursLeft,
    formattedDate: formatEndDateId(end, false),
  };
}
