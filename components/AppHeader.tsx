"use client";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PendingNavLink } from "@/components/PendingNavLink";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canSeeAdmin, canSeePending } from "@/lib/roles";
import { usePendingStore } from "@/store/pending";

export function AppHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = ["ru", "en", "uk"].includes(segments[0] || "");
  const second = hasLocale ? segments[1] : segments[0];
  const pendingTotal = usePendingStore((s) => s.total);
  const [menuOpen, setMenuOpen] = useState(false);
  const hide = second === "auth";
  const { data: session } = useSession();
  const role = (session?.user as { role?: string | null } | undefined)?.role ?? null;
  const canSeePendingNav = canSeePending(role);
  const canSeeAdminNav = canSeeAdmin(role);
  const canSeeUpload = canSeeAdminNav;

  if (hide) return null;

  return (
    <header className="border-b">
      <div className="w-full h-12 px-3 sm:px-5 flex items-center gap-2">
        {/* Mobile: menu */}
        <div className="md:hidden">
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" aria-label={t("menu")}>
                <Menu className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <div className="grid">
                <Link
                  href={`/${locale}/dictionary`}
                  className="px-2 py-1 rounded hover:bg-accent"
                  onClick={() => setMenuOpen(false)}
                >
                  {t("dictionary")}
                </Link>
                {canSeePendingNav && (
                  <Link
                    href={`/${locale}/pending`}
                    prefetch={false}
                    className="px-2 py-1 rounded hover:bg-accent inline-flex items-center gap-2"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span>{t("new")}</span>
                    {pendingTotal > 0 && <Badge className="ml-auto">{pendingTotal}</Badge>}
                  </Link>
                )}
                {canSeeAdminNav && (
                  <Link
                    href={`/${locale}/admin`}
                    className="px-2 py-1 rounded hover:bg-accent"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("adminPanel")}
                  </Link>
                )}
                {canSeeUpload && (
                  <Link
                    href={`/${locale}/upload`}
                    className="px-2 py-1 rounded hover:bg-accent"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("upload")}
                  </Link>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Brand */}
        <div className="text-sm text-muted-foreground">Cross</div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 mx-auto">
          <Link href={`/${locale}/dictionary`} className="underline-offset-4 hover:underline">
            {t("dictionary")}
          </Link>
          {canSeePendingNav && <PendingNavLink />}
          {canSeeAdminNav && (
            <Link href={`/${locale}/admin`} className="underline-offset-4 hover:underline">
              {t("adminPanel")}
            </Link>
          )}
          {canSeeUpload && (
            <Link href={`/${locale}/upload`} className="underline-offset-4 hover:underline">
              {t("upload")}
            </Link>
          )}
        </nav>

        {/* Actions */}
        <div className="ml-auto flex gap-2 sm:gap-4 items-center">
          <LanguageSwitcher />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
