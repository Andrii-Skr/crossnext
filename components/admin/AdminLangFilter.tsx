"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Lang = { code: string; name?: string | null };

export function AdminLangFilter({
  items,
  value,
}: {
  items: Lang[];
  value: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const options = useMemo(() => {
    const seen = new Set<string>();
    const list = items.filter((i) => {
      if (!i?.code) return false;
      const c = String(i.code).toLowerCase();
      if (seen.has(c)) return false;
      seen.add(c);
      return true;
    });
    return list.map((i) => ({
      value: String(i.code).toLowerCase(),
      label: i.name ? `${i.name} (${i.code})` : i.code,
    }));
  }, [items]);

  const current =
    options.find((o) => o.value === String(value).toLowerCase())?.value ||
    (options[0]?.value ?? "ru");

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t("language")}</span>
      <Select
        value={current}
        onValueChange={(v) => {
          const params = new URLSearchParams(sp?.toString() ?? "");
          params.set("lang", v);
          router.replace(`${pathname}?${params.toString()}`);
        }}
      >
        <SelectTrigger className="h-8 min-w-[8rem]" aria-label={t("language")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
