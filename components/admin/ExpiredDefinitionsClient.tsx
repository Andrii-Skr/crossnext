"use client";
import { Square, SquareCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { ExpiredDefinitionItem } from "@/components/admin/ExpiredDefinitionItem";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcDateFromPeriod, type Period, toEndOfDayUtcIso } from "@/lib/date";

type Item = { id: string; word: string; text: string; difficulty: number; endDateIso?: string | null };

export function ExpiredDefinitionsClient({
  items,
  difficulties = [],
  nowIso,
  extendAction,
  softDeleteAction,
  extendActionBulk,
}: {
  items: Item[];
  difficulties?: number[];
  nowIso?: string;
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  extendActionBulk: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<Period>("none");
  // use shared helper for hidden input values

  const bulkFormId = "bulk-extend-form";
  const baseNow = nowIso ? new Date(nowIso) : null;
  const endDate = calcDateFromPeriod(period, baseNow ?? undefined);
  const idsJoined = Array.from(selected).join(",");
  const difficultyOptions = difficulties.length ? difficulties : DEFAULT_DIFFICULTIES;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3">
        <div className="flex items-start gap-2 w-full sm:w-auto">
          <div className="grid gap-1 w-full">
            <span className="text-sm text-muted-foreground">{t("endDate")}</span>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
              <div className="w-full sm:w-44">
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger className="w-full sm:w-42 lg:w-42">
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
                <input type="hidden" name="end_date" value={toEndOfDayUtcIso(endDate) ?? ""} readOnly />
              </form>
              <ServerActionSubmit
                action={extendActionBulk}
                labelKey="save"
                successKey="definitionUpdated"
                size="sm"
                className="h-9 w-full sm:w-auto"
                formId={bulkFormId}
              />
            </div>
            <div className="flex gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-10 sm:w-auto justify-center"
                type="button"
                aria-label={t("selectAll")}
                title={t("selectAll")}
                onClick={() => setSelected(new Set(items.map((i) => i.id)))}
              >
                <SquareCheckBig className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("selectAll")}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-10 sm:w-auto justify-center"
                type="button"
                aria-label={t("clearSelection")}
                title={t("clearSelection")}
                onClick={() => setSelected(new Set())}
              >
                <Square className="size-4 sm:mr-2" />
                <span className="hidden sm:inline">{t("clearSelection")}</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground self-end sm:self-auto">{selected.size}</div>
      </div>
      <ul className="divide-y">
        {items.map((d) => (
          <ExpiredDefinitionItem
            key={d.id}
            item={d}
            nowIso={nowIso}
            extendAction={extendAction}
            softDeleteAction={softDeleteAction}
            difficulties={difficultyOptions}
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
