"use client";
import * as React from "react";
import { DateField, type DateFieldProps } from "@/components/ui/date-field";

export type DateFieldHiddenProps = Omit<
  DateFieldProps,
  "value" | "onChange" | "hiddenInputName"
> & {
  name: string;
  defaultValue?: Date | null;
};

export function DateFieldHidden({
  name,
  defaultValue = null,
  ...rest
}: DateFieldHiddenProps) {
  const [value, setValue] = React.useState<Date | null>(defaultValue);

  return (
    <>
      <DateField {...rest} value={value ?? undefined} onChange={setValue} />
      <input
        type="hidden"
        name={name}
        value={
          value
            ? new Date(
                value.getFullYear(),
                value.getMonth(),
                value.getDate(),
                23,
                59,
                59,
                999,
              ).toISOString()
            : ""
        }
        readOnly
      />
    </>
  );
}
