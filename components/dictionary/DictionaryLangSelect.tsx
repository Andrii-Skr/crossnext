"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";
import { type DictLang, useDictionaryStore } from "@/store/dictionary";

type LangRow = { id: number; code: string; name: string };

export function DictionaryLangSelect() {
  const t = useTranslations();
  const lang = useDictionaryStore((s) => s.dictionaryLang);
  const setLang = useDictionaryStore((s) => s.setDictionaryLang);

  const { data } = useQuery({
    queryKey: ["languages"],
    queryFn: () => fetcher<{ items: LangRow[] }>("/api/languages"),
    staleTime: 5 * 60_000,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  useEffect(() => {
    if (!items.length) return;
    // если сохранённый язык недоступен — переключаемся на первый из БД
    const validCodes = new Set(items.map((i) => i.code));
    if (!validCodes.has(lang)) setLang((items[0]?.code as DictLang) ?? "ru");
  }, [items, lang, setLang]);

  const options = items.length
    ? items.map((r) => ({
        value: r.code as DictLang,
        label: r.name ? `${r.name} (${r.code})` : r.code,
      }))
    : (["ru", "en", "uk"] as const).map((c) => ({
        value: c as string,
        label: c,
      }));

  return (
    <div className="flex items-center gap-2">
      <Select value={lang} onValueChange={(v) => setLang(v as DictLang)}>
        <SelectTrigger
          className="h-8 min-w-[7.5rem]"
          aria-label={t("language")}
        >
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
