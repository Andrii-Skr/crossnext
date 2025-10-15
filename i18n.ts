import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["ru", "en", "uk"] as const;
export const defaultLocale = "ru" as const;

export default getRequestConfig(async () => {
  const h = await headers();
  const requested = h.get("X-NEXT-INTL-LOCALE") || defaultLocale;
  const locale = (locales as readonly string[]).includes(requested)
    ? (requested as typeof defaultLocale)
    : defaultLocale;
  const messages = (await import(`./messages/${locale}.json`).catch(() => import("./messages/ru.json"))).default;
  return { locale, messages };
});
