"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ExpiredDefinitionItem } from "@/components/admin/ExpiredDefinitionItem";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Item = { id: string; word: string; text: string; endDateIso?: string | null };

export function ExpiredDefinitionsClient({
  items,
  extendAction,
  softDeleteAction,
  extendActionBulk,
}: {
  items: Item[];
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  extendActionBulk: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  type Period = "none" | "6m" | "1y" | "2y" | "5y";
  const [period, setPeriod] = useState<Period>("none");

  function calcDateFromPeriod(v: Period): Date | null {
    if (v === "none") return null;
    const base = new Date();
    const d = new Date(base);
    switch (v) {
      case "6m":
        d.setMonth(d.getMonth() + 6);
        break;
      case "1y":
        d.setFullYear(d.getFullYear() + 1);
        break;
      case "2y":
        d.setFullYear(d.getFullYear() + 2);
        break;
      case "5y":
        d.setFullYear(d.getFullYear() + 5);
        break;
    }
    return d;
  }
  function toEndOfDayUtcIso(d: Date | null): string {
    if (!d) return "";
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)).toISOString();
  }

  const bulkFormId = "bulk-extend-form";
  const endDate = calcDateFromPeriod(period);
  const idsJoined = Array.from(selected).join(",");

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <div className="grid gap-1">
            <span className="text-sm text-muted-foreground">{t("endDate")}</span>
            <div className="flex items-center gap-2">
              <div className="w-48">
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("noLimit")}</SelectItem>
                    <SelectItem value="6m">{t("period6months")}</SelectItem>
                    <SelectItem value="1y">{t("period1year")}</SelectItem>
                    <SelectItem value="2y">{t("period2years")}</SelectItem>
                    <SelectItem value="5y">{t("period5years")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <form id={bulkFormId} className="hidden">
                <input type="hidden" name="ids" value={idsJoined} readOnly />
                <input type="hidden" name="end_date" value={toEndOfDayUtcIso(endDate)} readOnly />
              </form>
              <ServerActionSubmit
                action={extendActionBulk}
                labelKey="save"
                successKey="definitionUpdated"
                size="sm"
                className="h-9"
                formId={bulkFormId}
              />
            </div>
            <div className="flex gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                type="button"
                onClick={() => setSelected(new Set(items.map((i) => i.id)))}
              >
                {t("selectAll")}
              </Button>
              <Button variant="ghost" size="sm" className="h-8" type="button" onClick={() => setSelected(new Set())}>
                {t("clearSelection")}
              </Button>
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">{selected.size}</div>
      </div>
      <ul className="divide-y">
        {items.map((d) => (
          <ExpiredDefinitionItem
            key={d.id}
            item={d}
            extendAction={extendAction}
            softDeleteAction={softDeleteAction}
            selectable
            selected={selected.has(d.id)}
            onToggleSelect={(id, next) => {
              setSelected((prev) => {
                const s = new Set(prev);
                if (next) s.add(id);
                else s.delete(id);
                return s;
              });
            }}
          />
        ))}
      </ul>
    </div>
  );
}
