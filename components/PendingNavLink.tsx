"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import { usePendingStore } from "@/store/pending";

export function PendingNavLink() {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useQuery({
    queryKey: ["pending-count"],
    queryFn: () =>
      fetcher<{ total: number; words: number; descriptions: number }>(
        "/api/pending/count",
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const total = usePendingStore((s) => s.total);
  const setCounts = usePendingStore((s) => s.setCounts);

  useEffect(() => {
    if (data) setCounts(data);
  }, [data, setCounts]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/${locale}/admin/pending`}
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
          >
            {t("new")} {total > 0 && <Badge className="ml-0.5">{total}</Badge>}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          {data
            ? t("pendingCardsTitle", { total: data.total })
            : t("pendingAwaitingApproval")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
