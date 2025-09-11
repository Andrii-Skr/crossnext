import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { UserMenu } from "@/components/UserMenu";
import { PendingNavLink } from "@/components/PendingNavLink";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  let messages: any;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return notFound();
  }
  const t = await getTranslations({ locale });
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <header className="border-b">
        <div className="relative w-full h-12 px-5 flex items-center">
          <div className="text-sm text-muted-foreground">Cross</div>
          <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
            <Link href={`/${locale}`} className="underline-offset-4 hover:underline">
              {t("dictionary")}
            </Link>
            <PendingNavLink />
          </nav>
          <div className="ml-auto flex gap-4 items-center">
            <LanguageSwitcher />
            <ThemeSwitcher />
            <UserMenu />
          </div>
        </div>
      </header>
      {children}
    </NextIntlClientProvider>
  );
}
