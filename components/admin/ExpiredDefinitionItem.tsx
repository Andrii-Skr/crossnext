"use client";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toEndOfDayUtcIso } from "@/lib/date";

type Period = "none" | "6m" | "1y" | "2y" | "5y";

function getPeriodFromEndDate(d: Date | null): Period {
  if (!d) return "none";
  const now = new Date();
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  if (months >= 59) return "5y";
  if (months >= 23) return "2y";
  if (months >= 11) return "1y";
  return "6m";
}

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

export function ExpiredDefinitionItem({
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
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={selected}
            onChange={(e) => onToggleSelect?.(item.id, e.currentTarget.checked)}
            aria-label="select"
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
      <div className="flex flex-col items-end gap-2 shrink-0">
        <form action={extendAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <Select
            value={period}
            onValueChange={(v) => {
              const p = v as Period;
              setPeriod(p);
              setEndLocal(calcDateFromPeriod(p));
            }}
          >
            <SelectTrigger className="h-8 px-2 text-xs w-48 justify-start">
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
          <ServerActionSubmit action={extendAction} labelKey="save" successKey="definitionUpdated" size="sm" />
        </form>
        <ServerActionButton
          id={item.id}
          action={softDeleteAction}
          labelKey="delete"
          successKey="definitionDeleted"
          size="sm"
          variant="destructive"
        />
      </div>
    </li>
  );
}
