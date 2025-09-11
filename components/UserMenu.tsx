"use client";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Flag, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";

export function UserMenu({ name }: { name?: string }) {
  const t = useTranslations();
  const { data } = useSession();
  const sessionName = name ?? data?.user?.name ?? null;
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const currentLocale = ["ru", "en", "uk"].includes(segments[0]) ? segments[0] : "ru";
  return (
    <nav className="flex gap-3 items-center">
      {sessionName && (
        <span className="text-sm text-muted-foreground" title={sessionName}>
          {sessionName}
        </span>
      )}
      <button
        className="text-sm text-muted-foreground hover:text-foreground p-1 rounded"
        onClick={() => signOut({ callbackUrl: `/${currentLocale}/auth/sign-in` })}
        aria-label={t("logout")}
        title={t("logout")}
      >
        <LogOut className="size-5" aria-hidden />
      </button>
    </nav>
  );
}
