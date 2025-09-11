"use client";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { fetcher } from "@/lib/fetcher";

export type FiltersValue = {
  q: string;
  scope: "word" | "def" | "both";
  tags?: string[];
  searchMode?: "contains" | "startsWith";
  lenSortField?: "word" | "def";
  lenDir?: "asc" | "desc";
  lenFilterField?: "word" | "def";
  lenValue?: number;
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
                ...(v ? {} : { lenValue: undefined }),
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
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            placeholder={t("lengthValuePlaceholder")}
            aria-label={t("lengthValuePlaceholder")}
            className="h-5 w-20 text-xs placeholder:text-xs appearance-none [appearance:textfield]"
            value={value.lenValue ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const num = raw === "" ? undefined : Number.parseInt(raw, 10);
              onChange({
                ...value,
                lenValue: Number.isFinite(num as number)
                  ? (num as number)
                  : undefined,
              });
            }}
            disabled={!value.lenFilterField}
          />
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
