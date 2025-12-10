"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import { canSeePending } from "@/lib/roles";
import { usePendingStore } from "@/store/pending";

export function PendingNavLink() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();
  const router = useRouter();
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

  const role = (session?.user as { role?: string | null } | undefined)?.role ?? null;
  const canSee = canSeePending(role);

  if (!canSee) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
            onClick={() => router.push(`/${locale}/admin/pending`)}
          >
            <span>{t("new")}</span>
            {total > 0 && <Badge className="ml-0.5">{total}</Badge>}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {data ? t("pendingCardsTitle", { total: data.total }) : t("pendingAwaitingApproval")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
