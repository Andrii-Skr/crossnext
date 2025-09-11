import { NextIntlClientProvider } from "next-intl";
import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  let messages: any;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    return notFound();
  }
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppHeader />
      {children}
    </NextIntlClientProvider>
  );
}
