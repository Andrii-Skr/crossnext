import { notFound } from "next/navigation";
import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  let messages: AbstractIntlMessages;
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
