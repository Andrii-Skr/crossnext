"use client";
import { usePathname } from "next/navigation";
import { createTranslator } from "next-intl";
import enMessages from "@/messages/en.json";
import ruMessages from "@/messages/ru.json";
import ukMessages from "@/messages/uk.json";

type Locale = "ru" | "en" | "uk";

const MESSAGES: Record<Locale, typeof enMessages> = {
  ru: ruMessages,
  en: enMessages,
  uk: ukMessages,
};

function resolveLocale(pathname: string): Locale {
  const localeFromPath = pathname.split("/")[1];
  if (localeFromPath === "en" || localeFromPath === "uk" || localeFromPath === "ru") {
    return localeFromPath;
  }
  return "ru";
}

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const pathname = usePathname();
  const locale = resolveLocale(pathname);
  const t = createTranslator({ locale, messages: MESSAGES[locale] });

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold mb-2">{t("somethingWentWrong")}</h1>
      <pre className="text-sm text-muted-foreground whitespace-pre-wrap">{error.message}</pre>
    </div>
  );
}
