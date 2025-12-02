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

import { useEffect, useState } from "react";

/**
 * Stable application time zone used on both server and during hydration.
 * Defaults to UTC, can be overridden via NEXT_PUBLIC_APP_TIME_ZONE.
 */
const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "UTC";

export function getBrowserTimeZone(): string {
  // Keep deterministic to avoid SSR/CSR divergence. For real browser tz use useClientTimeZone().
  return APP_TIME_ZONE;
}

function detectBrowserTimeZone(): string {
  if (typeof window === "undefined") return APP_TIME_ZONE;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz || APP_TIME_ZONE;
}

export function useClientTimeZone(): string {
  const [tz, setTz] = useState<string>(APP_TIME_ZONE);
  useEffect(() => {
    setTz(detectBrowserTimeZone());
  }, []);
  return tz;
}

// Common discrete "end period" options used across UI to set or interpret end dates
export type Period = "none" | "6m" | "1y" | "2y" | "5y";

// Infer a UI period bucket from a concrete end date (approximate by months ahead)
export function getPeriodFromEndDate(d: Date | null): Period {
  if (!d) return "none";
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  if (months >= 59) return "5y";
  if (months >= 23) return "2y";
  if (months >= 11) return "1y";
  return "6m";
}

// Convert a UI period bucket to a concrete Date (relative to now)
export function calcDateFromPeriod(v: Period): Date | null {
  if (v === "none") return null;
  const base = new Date();
  const d = new Date(base);
  switch (v) {
    case "6m":
      d.setMonth(d.getMonth() + 6);
      break;
    case "1y":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "2y":
      d.setFullYear(d.getFullYear() + 2);
      break;
    case "5y":
      d.setFullYear(d.getFullYear() + 5);
      break;
  }
  return d;
}
