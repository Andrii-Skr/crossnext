"use client";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calcDateFromPeriod, getPeriodFromEndDate, type Period, toEndOfDayUtcIso } from "@/lib/date";
import { cn } from "@/lib/utils";

type Props = {
  value: Date | null;
  onChange: (next: Date | null) => void;
  baseNow?: Date | null;
  name?: string; // optional hidden input name
  form?: string; // optional target form for hidden input
  label?: React.ReactNode;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
};

/**
 * Unified end-date selector that maps discrete periods to concrete Date values.
 * Renders a hidden input when `name` is provided, converting the Date to 23:59:59.999 UTC.
 */
export function EndDateSelect({
  value,
  onChange,
  baseNow,
  name,
  form,
  label,
  className,
  triggerClassName,
  disabled,
}: Props) {
  const t = useTranslations();
  const period = React.useMemo(() => getPeriodFromEndDate(value, baseNow ?? undefined), [baseNow, value]);

  return (
    <div className={cn("grid gap-1 w-full min-w-0", className)}>
      {label ? <span className="text-sm text-muted-foreground block">{label}</span> : null}
      {name ? <input type="hidden" name={name} form={form} value={toEndOfDayUtcIso(value) ?? ""} readOnly /> : null}
      <Select
        value={period}
        onValueChange={(v) => onChange(calcDateFromPeriod(v as Period, baseNow ?? undefined))}
        disabled={disabled}
      >
        <SelectTrigger className={cn("h-10 px-3 text-sm justify-between", triggerClassName)}>
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
  );
}
