"use client";
import * as React from "react";
import { DateField, type DateFieldProps } from "@/components/ui/date-field";
import { toEndOfDayUtcIso, toUtcDateOnly } from "@/lib/date";

export type DateFieldHiddenProps = Omit<DateFieldProps, "value" | "onChange" | "hiddenInputName"> & {
  name: string;
  defaultValue?: Date | null;
};

export function DateFieldHidden({ name, defaultValue = null, ...rest }: DateFieldHiddenProps) {
  const [value, setValue] = React.useState<Date | null>(defaultValue ? toUtcDateOnly(defaultValue) : null);

  React.useEffect(() => {
    setValue(defaultValue ? toUtcDateOnly(defaultValue) : null);
  }, [defaultValue]);

  return (
    <>
      <DateField {...rest} value={value ?? undefined} onChange={setValue} />
      <input type="hidden" name={name} value={value ? (toEndOfDayUtcIso(value) ?? "") : ""} readOnly />
    </>
  );
}
