"use client";
import * as React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { getBrowserTimeZone } from "@/lib/date";

export function CreatedAt({ iso }: { iso: string }) {
  const f = useFormatter();
  const t = useTranslations();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dt = new Date(iso);
  const value = mounted
    ? f.dateTime(dt, { dateStyle: "short", timeStyle: "short", timeZone: getBrowserTimeZone() })
    : "—";
  return <div>{t("pendingCreatedAt", { value })}</div>;
}
