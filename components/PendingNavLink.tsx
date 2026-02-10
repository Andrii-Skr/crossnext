"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetcher } from "@/lib/fetcher";
import { canSeePending } from "@/lib/roles";
import { usePendingStore } from "@/store/pending";

export function PendingNavLink() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string | null } | undefined)?.role ?? null;
  const canSee = canSeePending(role);
  const signedOutRef = useRef(false);
  const { data, error, isError } = useQuery<{ total: number; words: number; descriptions: number }, Error>({
    queryKey: ["pending-count"],
    queryFn: () => fetcher<{ total: number; words: number; descriptions: number }>("/api/pending/count"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: status === "authenticated" && canSee,
    retry: (failureCount, error) => {
      const statusCode = (error as { status?: number } | null)?.status;
      if (statusCode === 401 || statusCode === 403) return false;
      return failureCount < 3;
    },
  });
  const total = usePendingStore((s) => s.total);
  const setCounts = usePendingStore((s) => s.setCounts);

  useEffect(() => {
    if (data) setCounts(data);
  }, [data, setCounts]);

  useEffect(() => {
    if (!isError || signedOutRef.current) return;
    const statusCode = (error as { status?: number } | null)?.status;
    if (statusCode === 401) {
      signedOutRef.current = true;
      void signOut({ callbackUrl: `/${locale}/auth/sign-in` });
    }
  }, [error, isError, locale]);

  if (!canSee) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/${locale}/pending`}
            prefetch={false}
            className="inline-flex items-center gap-2 underline-offset-4 hover:underline"
          >
            <span>{t("new")}</span>
            {total > 0 && <Badge className="ml-0.5">{total}</Badge>}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          {data ? t("pendingCardsTitle", { total: data.total }) : t("pendingAwaitingApproval")}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
