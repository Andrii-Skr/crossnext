"use client";
import * as React from "react";
import { DateField, type DateFieldProps } from "@/components/ui/date-field";

export type DateFieldHiddenProps = Omit<DateFieldProps, "value" | "onChange" | "hiddenInputName"> & {
  name: string;
  defaultValue?: Date | null;
};

export function DateFieldHidden({ name, defaultValue = null, ...rest }: DateFieldHiddenProps) {
  const toUtcMidnight = React.useCallback((date: Date) => {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }, []);

  const [value, setValue] = React.useState<Date | null>(defaultValue ? toUtcMidnight(defaultValue) : null);

  React.useEffect(() => {
    setValue(defaultValue ? toUtcMidnight(defaultValue) : null);
  }, [defaultValue, toUtcMidnight]);

  return (
    <>
      <DateField {...rest} value={value ?? undefined} onChange={setValue} />
      <input
        type="hidden"
        name={name}
        value={
          value
            ? new Date(
                Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(), 23, 59, 59, 999),
              ).toISOString()
            : ""
        }
        readOnly
      />
    </>
  );
}
