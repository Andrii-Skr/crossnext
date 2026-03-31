"use client";
import { Save, Trash2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EndDateSelect } from "@/components/ui/end-date-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientTimeZone } from "@/lib/date";

export const ExpiredDefinitionItem = React.memo(function ExpiredDefinitionItem({
  item,
  extendAction,
  softDeleteAction,
  difficulties = [],
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
  const difficultyOptions = React.useMemo(() => (difficulties.length ? [...difficulties] : []), [difficulties]);
  const derivedDifficulty = React.useMemo(() => {
    return item.difficulty ?? difficultyOptions[0] ?? 1;
  }, [difficultyOptions, item.difficulty]);
  const [difficulty, setDifficulty] = React.useState<number>(derivedDifficulty);
  const end = React.useMemo(() => (item.endDateIso ? new Date(item.endDateIso) : null), [item.endDateIso]);
  const [endLocal, setEndLocal] = React.useState<Date | null>(end);
  React.useEffect(() => {
    setEndLocal((prev) => {
      const prevTime = prev?.getTime();
      const nextTime = end?.getTime();
      if (prevTime === nextTime) return prev;
      return end;
    });
  }, [end]);
  React.useEffect(() => {
    setDifficulty((prev) => (prev === derivedDifficulty ? prev : derivedDifficulty));
  }, [derivedDifficulty]);
  return (
    <div className="flex flex-col lg:flex-row items-stretch lg:items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {selectable ? (
          <Checkbox
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
          <div className="wrap-break-word">{item.text}</div>
        </div>
      </div>
      <div className="flex flex-wrap lg:flex-nowrap items-end gap-2 shrink-0 w-full lg:w-auto lg:justify-end">
        <form className="flex flex-wrap lg:flex-nowrap items-end gap-2 w-full lg:w-auto">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="difficulty" value={difficulty} readOnly />
          <div className="grid gap-1 w-full sm:w-auto min-w-0 lg:items-start lg:justify-items-start lg:text-left">
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
          <EndDateSelect
            value={endLocal}
            onChange={setEndLocal}
            baseNow={baseNow}
            name="end_date"
            label={t("endDate")}
            labelClassName="text-xs"
            className="w-full sm:w-auto lg:items-start lg:justify-items-start lg:text-left"
            triggerClassName="h-9 px-3 text-sm w-full sm:w-42 lg:w-42 justify-between"
          />
          <ServerActionSubmit
            action={extendAction}
            labelKey="save"
            successKey="definitionUpdated"
            size="sm"
            showLabel={false}
            ariaLabelKey="save"
            className="h-9 w-9 p-0 shrink-0"
          >
            <Save className="size-4" aria-hidden />
          </ServerActionSubmit>
        </form>
        <ServerActionButton
          id={item.id}
          action={softDeleteAction}
          labelKey="delete"
          successKey="definitionDeleted"
          size="sm"
          variant="destructive"
          showLabel={false}
          ariaLabelKey="delete"
          leftIcon={<Trash2 className="size-4" aria-hidden />}
          className="h-9 w-9 p-0 shrink-0"
        />
      </div>
    </div>
  );
});
