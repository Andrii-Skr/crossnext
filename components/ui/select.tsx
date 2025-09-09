import * as React from "react";
import { cn } from "@/lib/utils";

type BaseProps = React.HTMLAttributes<HTMLDivElement> & { className?: string };

type SelectRootProps = {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
};

// A minimal, native-backed Select that mimics shadcn/ui API for our use case.
function Select({ value, onValueChange, className, children }: SelectRootProps) {
  const items = React.useMemo(() => collectItems(children), [children]);
  return (
    <select
      className={cn(
        "border bg-background shadow-xs hover:bg-accent/20 dark:bg-input/30 dark:border-input h-8 rounded-md px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        className
      )}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      aria-haspopup="listbox"
    >
      {items.map((it) => (
        <option key={it.value} value={it.value}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

function SelectTrigger({ className, ...props }: BaseProps) {
  return <div className={className} {...props} />;
}

function SelectValue({ className, ...props }: BaseProps) {
  return <div className={className} {...props} />;
}

function SelectContent({ className, ...props }: BaseProps) {
  return <div className={className} {...props} />;
}

type SelectItemProps = {
  value: string;
  children: React.ReactNode;
};

function SelectItem(_props: SelectItemProps) {
  return null;
}
SelectItem.displayName = "SelectItem";

function collectItems(children: React.ReactNode): { value: string; label: React.ReactNode }[] {
  const arr: { value: string; label: React.ReactNode }[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if ((child.type as any)?.displayName === "SelectItem") {
      const { value, children: label } = child.props as SelectItemProps;
      arr.push({ value, label });
      return;
    }
    if (child.props?.children) {
      arr.push(...collectItems(child.props.children));
    }
  });
  return arr;
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };

