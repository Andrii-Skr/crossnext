"use client";
import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
}: DateFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Date | null>(value ?? null);
  React.useEffect(() => {
    setSelected(value ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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
            {selected
              ? formatLabel
                ? formatLabel(selected)
                : selected.toLocaleDateString()
              : placeholder}
            <ChevronDownIcon className="size-4 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden p-0" align="start">
          <div className="p-2">
            <Calendar
              mode="single"
              selected={selected ?? undefined}
              captionLayout={captionLayout}
              onSelect={(date) => {
                const next = date ?? null;
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
            value={
              selected
                ? new Date(
                    selected.getFullYear(),
                    selected.getMonth(),
                    selected.getDate(),
                    23,
                    59,
                    59,
                    999,
                  ).toISOString()
                : ""
            }
            readOnly
          />
        ) : null}
      </Popover>
    </div>
  );
}
