"use client";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Flag, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function UserMenu({ name }: { name?: string }) {
  const t = useTranslations();
  const { data } = useSession();
  const sessionName = name ?? data?.user?.name ?? null;
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = ["ru", "en", "uk"].includes(segments[0]) ? segments[0] : "ru";
  return (
    <nav className="flex gap-3 items-center">
      <TooltipProvider>
        {sessionName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm text-muted-foreground">{sessionName}</span>
            </TooltipTrigger>
            <TooltipContent>{sessionName}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="text-sm text-muted-foreground hover:text-foreground p-1 rounded"
              onClick={() => signOut({ callbackUrl: `/${currentLocale}/auth/sign-in` })}
              aria-label={t("logout")}
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent>{t("logout")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </nav>
  );
}
