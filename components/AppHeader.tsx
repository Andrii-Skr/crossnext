"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PendingNavLink } from "@/components/PendingNavLink";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { UserMenu } from "@/components/UserMenu";

export function AppHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = ["ru", "en", "uk"].includes(segments[0] || "");
  const second = hasLocale ? segments[1] : segments[0];
  const hide = second === "auth";

  if (hide) return null;

  return (
    <header className="border-b">
      <div className="relative w-full h-12 px-5 flex items-center">
        <div className="text-sm text-muted-foreground">Cross</div>
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
          <Link href={`/${locale}`} className="underline-offset-4 hover:underline">
            {t("dictionary")}
          </Link>
          <PendingNavLink />
          <Link href={`/${locale}/admin`} className="underline-offset-4 hover:underline">
            {t("adminPanel")}
          </Link>
          <Link href={`/${locale}/upload`} className="underline-offset-4 hover:underline">
            {t("upload")}
          </Link>
        </nav>
        <div className="ml-auto flex gap-4 items-center">
          <LanguageSwitcher />
          <ThemeSwitcher />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
