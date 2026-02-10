"use client";

import { ChevronsUpDown, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DictionaryTemplateItem } from "@/types/dictionary-templates";

type TemplatePickerProps = {
  templates: DictionaryTemplateItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  loading: boolean;
  error: boolean;
  showLabel?: boolean;
  showMeta?: boolean;
};

export function TemplatePicker({
  templates,
  selectedId,
  onSelect,
  loading,
  error,
  showLabel = true,
  showMeta = true,
}: TemplatePickerProps) {
  const t = useTranslations();
  const f = useFormatter();
  const [comboOpen, setComboOpen] = useState(false);
  const [comboQuery, setComboQuery] = useState("");

  const selected = useMemo(() => templates.find((tpl) => tpl.id === selectedId) ?? null, [templates, selectedId]);
  const filteredTemplates = useMemo(() => {
    const q = comboQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((tpl) => {
      const nameMatch = tpl.name.toLowerCase().includes(q);
      const queryMatch = tpl.query?.toLowerCase().includes(q) ?? false;
      const tagMatch = (tpl.tagNames ?? []).some((tag) => tag.toLowerCase().includes(q));
      const excludeMatch = (tpl.excludeTagNames ?? []).some((tag) => tag.toLowerCase().includes(q));
      return nameMatch || queryMatch || tagMatch || excludeMatch;
    });
  }, [comboQuery, templates]);

  const scopeLabel = (tpl: DictionaryTemplateItem) => {
    if (tpl.scope === "def") return t("scopeDef");
    if (tpl.scope === "both") return t("scopeBoth");
    return t("scopeWord");
  };

  const modeLabel = (tpl: DictionaryTemplateItem) => {
    if (tpl.searchMode === "exact") return t("searchModeExact");
    if (tpl.searchMode === "startsWith") return t("searchModeStartsWith");
    return t("searchModeContains");
  };

  const formatRange = (min: number | null, max: number | null) => {
    if (typeof min === "number" && typeof max === "number") {
      return `${f.number(min)}–${f.number(max)}`;
    }
    if (typeof min === "number") {
      return t("templateRangeFrom", { value: f.number(min) });
    }
    if (typeof max === "number") {
      return t("templateRangeTo", { value: f.number(max) });
    }
    return t("templateRangeAny");
  };

  const metaBadgesFor = (tpl: DictionaryTemplateItem) => {
    const metaBadges: string[] = [];
    if (tpl.query?.trim()) {
      metaBadges.push(t("templateMetaQuery", { value: tpl.query.trim() }));
    }
    if (tpl.lenFilterField || tpl.lenMin != null || tpl.lenMax != null) {
      const field = tpl.lenFilterField === "def" ? t("lengthSortDef") : t("lengthSortWord");
      metaBadges.push(t("templateMetaLength", { field, range: formatRange(tpl.lenMin, tpl.lenMax) }));
    }
    if (tpl.difficultyMin != null || tpl.difficultyMax != null) {
      metaBadges.push(t("templateMetaDifficulty", { range: formatRange(tpl.difficultyMin, tpl.difficultyMax) }));
    }
    return metaBadges;
  };

  return (
    <div className="grid gap-2">
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <span>{t("templateListLoading")}</span>
        </div>
      )}
      {!loading && error && <p className="text-sm text-destructive">{t("templateListError")}</p>}
      {!loading && !error && templates.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("templateListEmpty")}</p>
      )}
      {!loading && !error && templates.length > 0 && (
        <div className="grid gap-2">
          {showLabel && <span className="text-xs text-muted-foreground">{t("templateSelectLabel")}</span>}
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                className="w-full justify-between"
              >
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                  {selected ? selected.name : t("templateSelectPlaceholder")}
                </span>
                <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
              <Input
                placeholder={t("templateSearchPlaceholder")}
                value={comboQuery}
                onChange={(e) => setComboQuery(e.target.value)}
                aria-label={t("templateSearchPlaceholder")}
              />
              <div className="mt-2 max-h-64 overflow-auto pr-1">
                {filteredTemplates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("templateSearchEmpty")}</p>
                ) : (
                  <ul className="grid gap-1">
                    {filteredTemplates.map((tpl) => {
                      const metaBadges = metaBadgesFor(tpl);
                      return (
                        <li key={tpl.id}>
                          <Button
                            type="button"
                            variant="ghost"
                            className={cn(
                              "!block !h-auto w-full whitespace-normal rounded-md border !px-3 !py-2 text-left !font-normal transition hover:bg-accent/50",
                              selectedId === tpl.id ? "border-primary ring-1 ring-primary/30" : "border-border",
                            )}
                            onClick={() => {
                              onSelect(tpl.id);
                              setComboOpen(false);
                            }}
                            aria-pressed={selectedId === tpl.id}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-sm">{tpl.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {scopeLabel(tpl)} / {modeLabel(tpl)}
                              </span>
                            </div>
                            {metaBadges.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {metaBadges.map((label) => (
                                  <Badge key={`${tpl.id}-meta-${label}`} variant="secondary">
                                    {label}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {tpl.tagNames?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tpl.tagNames.map((tag) => (
                                  <Badge key={tag} variant="outline">
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {tpl.excludeTagNames?.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {tpl.excludeTagNames.map((tag) => (
                                  <Badge
                                    key={`exclude-${tag}`}
                                    variant="outline"
                                    className="border-destructive/40 text-destructive line-through"
                                  >
                                    {tag}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </PopoverContent>
          </Popover>
          {showMeta && selected && (
            <div className="grid gap-2 rounded-md border bg-muted/20 p-2">
              <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                <span>
                  {scopeLabel(selected)} / {modeLabel(selected)}
                </span>
              </div>
              {(() => {
                const metaBadges = metaBadgesFor(selected);
                if (metaBadges.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1">
                    {metaBadges.map((label) => (
                      <Badge key={`selected-meta-${label}`} variant="secondary">
                        {label}
                      </Badge>
                    ))}
                  </div>
                );
              })()}
              {selected.tagNames?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.tagNames.map((tag) => (
                    <Badge key={`selected-tag-${tag}`} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
              {selected.excludeTagNames?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span>{t("excludedTagsLabel")}</span>
                  {selected.excludeTagNames.map((tag) => (
                    <Badge
                      key={`selected-exclude-${tag}`}
                      variant="outline"
                      className="border-destructive/40 text-destructive line-through"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
