// Date helpers centralized to avoid duplicated logic and subtle timezone bugs

/**
 * Returns a Date at 00:00:00.000 UTC for the same calendar day
 * represented by the provided UTC-based Date.
 */
export function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Returns a Date at 00:00:00.000 UTC for the same local calendar day
 * represented by the provided Date (interpreting it in local time).
 * Useful for normalizing day values coming from date pickers.
 */
export function toUtcDateOnlyFromLocal(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Returns an ISO string for 23:59:59.999 UTC of the provided day,
 * or null if input is null.
 */
export function toEndOfDayUtcIso(date: Date | null): string | null {
  if (!date) return null;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999),
  ).toISOString();
}
