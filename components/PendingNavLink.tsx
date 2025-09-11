"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";
import { useLocale, useTranslations } from "next-intl";
import { usePendingStore } from "@/lib/stores/pending";

export function PendingNavLink() {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useQuery({
    queryKey: ["pending-count"],
    queryFn: () => fetcher<{ total: number; words: number; descriptions: number }>("/api/pending/count"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const total = usePendingStore((s) => s.total);
  const setCounts = usePendingStore((s) => s.setCounts);

  useEffect(() => {
    if (data) setCounts(data);
  }, [data, setCounts]);

  return (
    <Link
      href={`/${locale}/admin/pending`}
      className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
      title={data ? t("pendingCountsTitle", { words: data.words, descriptions: data.descriptions }) : t("pendingAwaitingApproval")}
    >
      {t("new")} {total > 0 && <Badge className="ml-0.5">{total}</Badge>}
    </Link>
  );
}
