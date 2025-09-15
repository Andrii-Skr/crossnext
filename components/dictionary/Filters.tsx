"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetcher } from "@/lib/fetcher";
import { useDifficulties } from "@/lib/useDifficulties";

export type FiltersValue = {
  q: string;
  scope: "word" | "def" | "both";
  tags?: string[];
  searchMode?: "contains" | "startsWith";
  lenSortField?: "word" | "def";
  lenDir?: "asc" | "desc";
  lenFilterField?: "word" | "def";
  lenMin?: number;
  lenMax?: number;
  difficulty?: number;
};

export function Filters({
  value,
  onChange,
}: {
  value: FiltersValue;
  onChange: (v: FiltersValue) => void;
}) {
  const t = useTranslations();
  const [tagQuery, setTagQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { id: number; name: string }[]
  >([]);
  // Mount guard to avoid Radix Select SSR hydration id drift
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: difficultiesData } = useDifficulties(mounted);

  useEffect(() => {
    let cancelled = false;
    if (!tagQuery) {
      setSuggestions([]);
      return;
    }
    fetcher<{ items: { id: number; name: string }[] }>(
      `/api/tags?q=${encodeURIComponent(tagQuery)}`,
    )
      .then((d) => !cancelled && setSuggestions(d.items))
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [tagQuery]);

  // Difficulties are cached via React Query; no manual effect

  const radios = useMemo(
    () =>
      [
        { id: "both", label: t("scopeBoth") },
        { id: "word", label: t("scopeWord") },
        { id: "def", label: t("scopeDef") },
      ] as const,
    [t],
  );

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b p-4 grid gap-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder={t("searchPlaceholder")}
            value={value.q}
            onChange={(e) => onChange({ ...value, q: e.target.value })}
            aria-label={t("searchAria")}
          />
        </div>
        <div className="flex-1 grid gap-1">
          <Input
            placeholder={t("tagFilterPlaceholder")}
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const name = tagQuery.trim();
                if (!name) return;
                const next = Array.from(new Set([...(value.tags ?? []), name]));
                onChange({ ...value, tags: next });
                setTagQuery("");
              }
            }}
            aria-label={t("tagAria")}
            list="tag-suggestions"
          />
          <datalist id="tag-suggestions">
            {suggestions.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <Badge
                  key={s.id}
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => {
                    const next = Array.from(
                      new Set([...(value.tags ?? []), s.name]),
                    );
                    onChange({ ...value, tags: next });
                    setTagQuery("");
                  }}
                >
                  <span className="mb-1 h-3">{s.name}</span>
                </Badge>
              ))}
            </div>
          )}
          {(value.tags?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-2">
              {(value.tags ?? []).map((name) => (
                <Badge key={name} variant="secondary" className="gap-1">
                  <span className="mb-1 h-3">{name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="inline-flex h-4 w-4 items-center justify-center p-0 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      onChange({
                        ...value,
                        tags: (value.tags ?? []).filter((n) => n !== name),
                      })
                    }
                    aria-label="Remove tag"
                  >
                    <X className="size-3" aria-hidden />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="grid gap-2 text-sm">
        {/* Scope */}
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground text-xs">
            {t("scopeLabel")}
          </span>
          <RadioGroup
            className="flex gap-2 items-center"
            value={value.scope}
            onValueChange={(v) =>
              onChange({ ...value, scope: v as FiltersValue["scope"] })
            }
          >
            {radios.map((r) => (
              <div key={r.id} className="flex items-center gap-1">
                <RadioGroupItem
                  value={r.id}
                  id={`scope-${r.id}`}
                  className="size-3"
                />
                <Label htmlFor={`scope-${r.id}`} className="text-xs">
                  {r.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Match */}
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground text-xs">
            {t("searchModeLabel")}
          </span>
          <RadioGroup
            className="flex gap-3"
            value={value.searchMode ?? "contains"}
            onValueChange={(v) =>
              onChange({ ...value, searchMode: v as "contains" | "startsWith" })
            }
          >
            <div className="flex items-center gap-1">
              <RadioGroupItem
                value="contains"
                id="mode-contains"
                className="size-3"
              />
              <Label htmlFor="mode-contains" className="text-xs">
                {t("searchModeContains")}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem
                value="startsWith"
                id="mode-startsWith"
                className="size-3"
              />
              <Label htmlFor="mode-startsWith" className="text-xs">
                {t("searchModeStartsWith")}
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Difficulty filter */}
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground text-xs">
            {t("difficultyFilterLabel")}
          </span>
          {mounted ? (
            <Select
              value={value.difficulty !== undefined ? String(value.difficulty) : ""}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  difficulty: v === "any" || v === "" ? undefined : Number.parseInt(v, 10),
                })
              }
            >
              <SelectTrigger size="xs" className="w-20" aria-label={t("difficultyFilterLabel")}>
                <SelectValue placeholder={t("difficultyAny")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("difficultyAny")}</SelectItem>
                {difficulties.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            // SSR-safe placeholder to avoid hydration mismatches
            <span className="inline-flex h-5 w-20 rounded-md border px-2 text-[10px] items-center text-muted-foreground">
              {t("difficultyAny")}
            </span>
          )}
        </div>

        {/* Length filter */}
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground text-xs">
            {t("lengthFilterLabel")}
          </span>
          <RadioGroup
            className="flex gap-2 items-center"
            value={value.lenFilterField ?? ""}
            onValueChange={(v) =>
              onChange({
                ...value,
                lenFilterField: v ? (v as "word" | "def") : undefined,
                ...(v ? {} : { lenMin: undefined, lenMax: undefined }),
              })
            }
          >
            <div className="flex items-center gap-1">
              <RadioGroupItem value="" id="lenf-none" className="size-3" />
              <Label htmlFor="lenf-none" className="text-xs">
                {t("lengthSortNone")}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="word" id="lenf-word" className="size-3" />
              <Label htmlFor="lenf-word" className="text-xs">
                {t("lengthSortWord")}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="def" id="lenf-def" className="size-3" />
              <Label htmlFor="lenf-def" className="text-xs">
                {t("lengthSortDef")}
              </Label>
            </div>
          </RadioGroup>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder={t("lengthMinPlaceholder")}
              aria-label={t("lengthMinPlaceholder")}
              className="h-5 w-20 text-xs placeholder:text-xs appearance-none [appearance:textfield]"
              value={value.lenMin ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === "" ? undefined : Number.parseInt(raw, 10);
                onChange({
                  ...value,
                  lenMin: Number.isFinite(num as number)
                    ? (num as number)
                    : undefined,
                });
              }}
              disabled={!value.lenFilterField}
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder={t("lengthMaxPlaceholder")}
              aria-label={t("lengthMaxPlaceholder")}
              className="h-5 w-20 text-xs placeholder:text-xs appearance-none [appearance:textfield]"
              value={value.lenMax ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                const num = raw === "" ? undefined : Number.parseInt(raw, 10);
                onChange({
                  ...value,
                  lenMax: Number.isFinite(num as number)
                    ? (num as number)
                    : undefined,
                });
              }}
              disabled={!value.lenFilterField}
            />
          </div>
        </div>

        {/* Length sort */}
        <div className="flex gap-2 items-center">
          <span className="text-muted-foreground text-xs">
            {t("lengthSortLabel")}
          </span>
          <RadioGroup
            className="flex gap-2 items-center"
            value={value.lenDir ?? "none"}
            onValueChange={(v) =>
              onChange({
                ...value,
                lenDir: v === "none" ? undefined : (v as "asc" | "desc"),
              })
            }
          >
            <div className="flex items-center gap-1">
              <RadioGroupItem value="none" id="lens-none" className="size-3" />
              <Label htmlFor="lens-none" className="text-xs">
                {t("lengthSortNone")}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="asc" id="lens-asc" className="size-3" />
              <Label htmlFor="lens-asc" className="text-xs">
                {t("lengthSortAsc")}
              </Label>
            </div>
            <div className="flex items-center gap-1">
              <RadioGroupItem value="desc" id="lens-desc" className="size-3" />
              <Label htmlFor="lens-desc" className="text-xs">
                {t("lengthSortDesc")}
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </div>
  );
}
