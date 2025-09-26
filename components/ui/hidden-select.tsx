"use client";
import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type HiddenSelectOption = { value: string; label: string };

export function HiddenSelectField({
  name,
  defaultValue,
  options,
  triggerClassName,
  ariaLabel,
  disabled,
}: {
  name: string;
  defaultValue?: string;
  options: HiddenSelectOption[];
  triggerClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const safeDefault = useMemo(() => {
    return defaultValue ?? options[0]?.value ?? "";
  }, [defaultValue, options]);
  const [value, setValue] = useState<string>(safeDefault);

  return (
    <>
      <input type="hidden" name={name} value={value} readOnly />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger
          className={triggerClassName}
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
