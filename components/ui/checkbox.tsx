import * as React from "react";

import { cn } from "@/lib/utils";

const checkboxBaseClass =
  "size-4 shrink-0 rounded-sm border border-input bg-background align-middle accent-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2";

const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<"input">, "type">>(
  ({ className, ...props }, ref) => (
    <input data-slot="checkbox" type="checkbox" ref={ref} className={cn(checkboxBaseClass, className)} {...props} />
  ),
);

Checkbox.displayName = "Checkbox";

export { Checkbox };
