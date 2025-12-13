"use client";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcDateFromPeriod, getPeriodFromEndDate, type Period, toEndOfDayUtcIso, useClientTimeZone } from "@/lib/date";

export const ExpiredDefinitionItem = React.memo(function ExpiredDefinitionItem({
  item,
  extendAction,
  softDeleteAction,
  difficulties = DEFAULT_DIFFICULTIES,
  nowIso,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  item: { id: string; word: string; text: string; difficulty: number; endDateIso?: string | null };
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  difficulties?: readonly number[];
  nowIso?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const timeZone = useClientTimeZone();
  const baseNow = React.useMemo(() => (nowIso ? new Date(nowIso) : null), [nowIso]);
  const difficultyOptions = React.useMemo(() => {
    return difficulties.length ? [...difficulties] : [...DEFAULT_DIFFICULTIES];
  }, [difficulties]);
  const derivedDifficulty = React.useMemo(() => {
    return item.difficulty ?? difficultyOptions[0] ?? DEFAULT_DIFFICULTIES[0];
  }, [difficultyOptions, item.difficulty]);
  const [difficulty, setDifficulty] = React.useState<number>(derivedDifficulty);
  const end = React.useMemo(() => (item.endDateIso ? new Date(item.endDateIso) : null), [item.endDateIso]);
  const derivedPeriod = React.useMemo(() => getPeriodFromEndDate(end, baseNow ?? undefined), [end, baseNow]);
  const [period, setPeriod] = React.useState<Period>(derivedPeriod);
  const [endLocal, setEndLocal] = React.useState<Date | null>(end);
  React.useEffect(() => {
    setPeriod((prev) => (prev === derivedPeriod ? prev : derivedPeriod));
    setEndLocal((prev) => {
      const prevTime = prev?.getTime();
      const nextTime = end?.getTime();
      if (prevTime === nextTime) return prev;
      return end;
    });
  }, [derivedPeriod, end]);
  React.useEffect(() => {
    setDifficulty((prev) => (prev === derivedDifficulty ? prev : derivedDifficulty));
  }, [derivedDifficulty]);

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
                value: f.dateTime(end, { dateStyle: "short", timeZone }),
              })}
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
            <span>{t("difficultyFilterLabel")}</span>
            <Badge variant="outline">{difficulty}</Badge>
          </div>
          <div className="break-words">{item.text}</div>
        </div>
      </div>
      <div className="flex flex-col sm:items-end gap-2 shrink-0 w-full sm:w-auto">
        <form className="grid grid-cols-[minmax(0,_auto)_minmax(0,_1fr)] sm:grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)_auto] items-stretch gap-1 sm:gap-2 w-full">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="difficulty" value={difficulty} readOnly />
          <input type="hidden" name="end_date" value={toEndOfDayUtcIso(endLocal) ?? ""} readOnly />
          <div className="grid gap-1 w-full min-w-0 sm:items-end sm:justify-items-end sm:text-right">
            <span className="text-xs text-muted-foreground">{t("difficultyFilterLabel")}</span>
            <Select
              value={String(difficulty)}
              onValueChange={(v) => {
                const next = Number.parseInt(v, 10);
                setDifficulty((prev) => (Number.isFinite(next) ? next : prev));
              }}
            >
              <SelectTrigger className="h-9 text-sm w-15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {difficultyOptions.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1 w-full min-w-0 sm:items-end sm:justify-items-end sm:text-right">
            <span className="text-xs text-muted-foreground">{t("endDate")}</span>
            <Select
              value={period}
              onValueChange={(v) => {
                const p = v as Period;
                setPeriod(p);
                setEndLocal(calcDateFromPeriod(p, baseNow ?? undefined));
              }}
            >
              <SelectTrigger className="h-9 px-3 text-sm w-42 justify-between">
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
          <ServerActionSubmit
            action={extendAction}
            labelKey="save"
            successKey="definitionUpdated"
            size="sm"
            className="w-full sm:w-auto col-span-2 sm:col-span-1 justify-self-start sm:justify-self-end mt-3 sm:mt-0"
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
