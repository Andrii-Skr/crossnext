"use client";
import { ChevronDownIcon } from "lucide-react";
import { useFormatter } from "next-intl";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getBrowserTimeZone, toEndOfDayUtcIso, toUtcDateOnly, toUtcDateOnlyFromLocal } from "@/lib/date";
import { cn } from "@/lib/utils";

export type DateFieldProps = {
  id?: string;
  label?: React.ReactNode;
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  className?: string; // wrapper div
  buttonClassName?: string;
  captionLayout?: "label" | "dropdown";
  formatLabel?: (date: Date) => string;
  clearText?: string;
  ariaLabel?: string;
  hiddenInputName?: string; // optional hidden input name for forms
  minYear?: number;
  maxYear?: number;
};

export function DateField({
  id,
  label,
  value,
  onChange,
  placeholder,
  className,
  buttonClassName,
  captionLayout = "dropdown",
  formatLabel,
  clearText,
  ariaLabel,
  hiddenInputName,
  minYear,
  maxYear,
}: DateFieldProps) {
  const normalizeFromCalendar = React.useCallback((date: Date) => toUtcDateOnlyFromLocal(date), []);

  const normalizeUtc = React.useCallback((date: Date) => toUtcDateOnly(date), []);

  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Date | null>(value ? normalizeUtc(value) : null);
  const formatter = useFormatter();
  const formattedValue = React.useMemo(() => {
    if (!selected) return null;
    if (formatLabel) return formatLabel(selected);
    return formatter.dateTime(selected, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: getBrowserTimeZone(),
    });
  }, [formatLabel, formatter, selected]);
  React.useEffect(() => {
    setSelected(value ? normalizeUtc(value) : null);
  }, [normalizeUtc, value]);

  const currentYear = new Date().getFullYear();
  const safeMinYear = typeof minYear === "number" ? minYear : Math.max(1970, currentYear - 5);
  const fallbackMaxYear = typeof maxYear === "number" ? maxYear : currentYear + 10;
  const safeMaxYear = Math.max(safeMinYear, fallbackMaxYear);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label ? (
        <Label htmlFor={id} className="px-1">
          {label}
        </Label>
      ) : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id={id}
            aria-label={ariaLabel}
            className={cn("justify-between font-normal", buttonClassName)}
          >
            {formattedValue ?? placeholder}
            <ChevronDownIcon className="size-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <div className="p-2">
            <Calendar
              mode="single"
              selected={selected ?? undefined}
              captionLayout={captionLayout}
              fromYear={safeMinYear}
              toYear={safeMaxYear}
              onSelect={(date) => {
                const next = date ? normalizeFromCalendar(date) : null;
                setSelected(next);
                onChange?.(next);
                setOpen(false);
              }}
            />
            {clearText ? (
              <div className="mt-2 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    onChange?.(null);
                    setOpen(false);
                  }}
                >
                  {clearText}
                </Button>
              </div>
            ) : null}
          </div>
        </PopoverContent>
        {hiddenInputName ? (
          <input
            type="hidden"
            name={hiddenInputName}
            value={selected ? (toEndOfDayUtcIso(selected) ?? "") : ""}
            readOnly
          />
        ) : null}
      </Popover>
    </div>
  );
}
