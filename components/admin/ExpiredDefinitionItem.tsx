"use client";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcDateFromPeriod, getPeriodFromEndDate, type Period, toEndOfDayUtcIso } from "@/lib/date";

export const ExpiredDefinitionItem = React.memo(function ExpiredDefinitionItem({
  item,
  extendAction,
  softDeleteAction,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: { id: string; word: string; text: string; endDateIso?: string | null };
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const end = React.useMemo(() => (item.endDateIso ? new Date(item.endDateIso) : null), [item.endDateIso]);
  const [period, setPeriod] = React.useState<Period>(getPeriodFromEndDate(end));
  const [endLocal, setEndLocal] = React.useState<Date | null>(end);
  React.useEffect(() => {
    setPeriod(getPeriodFromEndDate(end));
    setEndLocal(end);
  }, [end]);

  return (
    <li className="flex flex-col sm:flex-row items-stretch sm:items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={selected}
            onChange={(e) => onToggleSelect?.(item.id, e.currentTarget.checked)}
            aria-label={t("select")}
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="text-sm text-rose-700 mb-1">
            {t("word")}: {item.word}
          </div>
          {end ? (
            <div className="text-xs text-muted-foreground mb-1">
              {t("expiresAt", {
                value: f.dateTime(end, { dateStyle: "short" }),
              })}
            </div>
          ) : null}
          <div className="break-words">{item.text}</div>
        </div>
      </div>
      <div className="flex flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
        <form className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
          <input type="hidden" name="id" value={item.id} />
          <Select
            value={period}
            onValueChange={(v) => {
              const p = v as Period;
              setPeriod(p);
              setEndLocal(calcDateFromPeriod(p));
            }}
          >
            <SelectTrigger className="h-9 px-3 text-sm w-full sm:w-40 lg:w-40 justify-between">
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
          <input type="hidden" name="end_date" value={toEndOfDayUtcIso(endLocal) ?? ""} readOnly />
          <ServerActionSubmit
            action={extendAction}
            labelKey="save"
            successKey="definitionUpdated"
            size="sm"
            className="w-full sm:w-auto"
          />
        </form>
        <ServerActionButton
          id={item.id}
          action={softDeleteAction}
          labelKey="delete"
          successKey="definitionDeleted"
          size="sm"
          variant="destructive"
          className="w-full sm:w-auto"
        />
      </div>
    </li>
  );
});
