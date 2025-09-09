"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const locales = ["ru", "en", "uk"] as const;
type Locale = typeof locales[number];

export function LanguageSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const segments = pathname.split("/").filter(Boolean);
  const currentLocale: Locale = (locales as readonly string[]).includes(segments[0] || "")
    ? (segments[0] as Locale)
    : "ru";

  function changeLocale(next: Locale) {
    const hasLocale = (locales as readonly string[]).includes(segments[0] || "");
    const rest = hasLocale ? segments.slice(1) : segments;
    const restPath = rest.length ? "/" + rest.join("/") : "";
    const qs = searchParams.toString();
    const href = `/${next}${restPath}${qs ? `?${qs}` : ""}`;
    router.push(href);
  }

  return (
    <Select value={currentLocale} onValueChange={(v) => changeLocale(v as Locale)}>
      <SelectTrigger className="w-[84px]" aria-label="Language">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((l) => (
          <SelectItem key={l} value={l}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
