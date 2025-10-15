"use client";
import { LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function UserMenu({ name }: { name?: string }) {
  const t = useTranslations();
  const { data } = useSession();
  const sessionName = name ?? data?.user?.name ?? null;
  const currentLocale = useLocale();
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
            <Button
              size="icon"
              variant="outline"
              onClick={() => signOut({ callbackUrl: `/${currentLocale}/auth/sign-in` })}
              aria-label={t("logout")}
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only">{t("logout")}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("logout")}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </nav>
  );
}
