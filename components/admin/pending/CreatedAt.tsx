"use client";
import { useFormatter, useTranslations } from "next-intl";
import { useClientTimeZone } from "@/lib/date";

export function CreatedAt({ iso }: { iso: string }) {
  const f = useFormatter();
  const t = useTranslations();
  const timeZone = useClientTimeZone();
  const dt = new Date(iso);
  const value = f.dateTime(dt, { dateStyle: "short", timeStyle: "short", timeZone });
  return <div>{t("pendingCreatedAt", { value })}</div>;
}
