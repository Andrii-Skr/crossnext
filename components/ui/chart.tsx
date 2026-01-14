"use client";

import * as React from "react";
import type { LegendPayload, TooltipContentProps } from "recharts";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    color?: string;
  }
>;

const ChartContext = React.createContext<ChartConfig | null>(null);

function useChartConfig() {
  return React.useContext(ChartContext);
}

type ChartContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  config: ChartConfig;
  children: React.ReactNode;
};

function ChartContainer({ config, className, children, style, ...props }: ChartContainerProps) {
  const id = React.useId();
  const cssVars = React.useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, item] of Object.entries(config)) {
      if (item.color) vars[`--color-${key}`] = item.color;
    }
    return vars;
  }, [config]);
  const mergedStyle = { ...cssVars, ...style } as React.CSSProperties;

  return (
    <ChartContext.Provider value={config}>
      <div data-chart={id} className={cn("flex aspect-video w-full text-xs", className)} style={mergedStyle} {...props}>
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;
const ChartLegend = RechartsPrimitive.Legend;

type ChartTooltipContentProps = React.HTMLAttributes<HTMLDivElement> &
  Partial<
    Pick<TooltipContentProps<number, string>, "active" | "payload" | "label" | "formatter" | "labelFormatter">
  > & {
    hideLabel?: boolean;
    hideIndicator?: boolean;
    indicator?: "line" | "dot" | "dashed";
    labelKey?: string;
    nameKey?: string;
  };

function ChartTooltipContent({
  active,
  payload,
  label,
  labelFormatter,
  formatter,
  hideLabel = false,
  hideIndicator = false,
  indicator = "dot",
  labelKey,
  nameKey,
  className,
}: ChartTooltipContentProps) {
  const config = useChartConfig();

  if (!active || !payload?.length) return null;

  const safePayload = payload ?? [];

  const rawLabel = (() => {
    if (labelKey) {
      const payloadItem = safePayload[0]?.payload;
      if (payloadItem && typeof payloadItem === "object" && labelKey in payloadItem) {
        return (payloadItem as Record<string, unknown>)[labelKey];
      }
    }
    return label;
  })();

  const resolvedLabel = typeof rawLabel === "string" || typeof rawLabel === "number" ? rawLabel : null;
  const labelText =
    resolvedLabel == null || hideLabel
      ? null
      : labelFormatter
        ? labelFormatter(String(resolvedLabel), safePayload)
        : resolvedLabel;

  return (
    <div className={cn("grid gap-1.5 rounded-lg border bg-background p-2 text-xs shadow-sm", className)}>
      {labelText != null ? <div className="font-medium">{labelText}</div> : null}
      <div className="grid gap-1">
        {safePayload.map((item, index) => {
          const configKey = (() => {
            if (nameKey && item.payload && typeof item.payload === "object") {
              const candidate = (item.payload as Record<string, unknown>)[nameKey];
              if (typeof candidate === "string") return candidate;
            }
            if (typeof item.dataKey === "string") return item.dataKey;
            if (typeof item.name === "string") return item.name;
            return null;
          })();

          const configItem = configKey ? config?.[configKey] : undefined;
          const indicatorColor = (typeof item.color === "string" && item.color) || configItem?.color || undefined;
          const formattedResult = formatter ? formatter(item.value, item.name, item, index, safePayload) : item.value;
          const formattedValue = Array.isArray(formattedResult) ? formattedResult[0] : formattedResult;
          const formattedName = Array.isArray(formattedResult) ? formattedResult[1] : null;
          const labelValue = formattedName ?? configItem?.label ?? item.name ?? configKey;
          const Icon = configItem?.icon;

          return (
            <div key={String(item.dataKey ?? item.name)} className="flex items-center gap-2">
              {Icon ? (
                <Icon className="h-3 w-3 text-muted-foreground" />
              ) : hideIndicator ? null : (
                <span
                  className={cn(
                    "shrink-0",
                    indicator === "line" && "h-0.5 w-3 rounded-full",
                    indicator === "dashed" && "h-2 w-2 rounded-full border border-dashed",
                    indicator === "dot" && "h-2 w-2 rounded-full",
                  )}
                  style={indicator === "dashed" ? { borderColor: indicatorColor } : { backgroundColor: indicatorColor }}
                />
              )}
              <span className="text-muted-foreground">{labelValue}</span>
              <span className="ml-auto font-medium text-foreground">{formattedValue}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ChartLegendContentProps = React.HTMLAttributes<HTMLDivElement> & {
  payload?: LegendPayload[];
  nameKey?: string;
};

function ChartLegendContent({ payload, nameKey, className }: ChartLegendContentProps) {
  const config = useChartConfig();

  if (!payload?.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-4 text-xs", className)}>
      {payload.map((item) => {
        const configKey = (() => {
          if (nameKey && item.payload && typeof item.payload === "object") {
            const candidate = (item.payload as Record<string, unknown>)[nameKey];
            if (typeof candidate === "string") return candidate;
          }
          if (typeof item.dataKey === "string") return item.dataKey;
          if (typeof item.value === "string") return item.value;
          return null;
        })();

        const configItem = configKey ? config?.[configKey] : undefined;
        const indicatorColor = (typeof item.color === "string" && item.color) || configItem?.color || undefined;
        const labelValue = configItem?.label ?? item.value ?? configKey;
        const Icon = configItem?.icon;

        return (
          <div key={String(item.dataKey ?? item.value)} className="flex items-center gap-2">
            {Icon ? (
              <Icon className="h-3 w-3 text-muted-foreground" />
            ) : (
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: indicatorColor }} />
            )}
            <span className="text-muted-foreground">{labelValue}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
