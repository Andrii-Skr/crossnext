"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdminStatsItemType, AdminStatsMonth } from "@/lib/admin/stats";
import { useClientTimeZone } from "@/lib/date";

const MAX_USER_SEGMENTS = 4;
const USER_SEGMENT_COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48"];
const USER_SEGMENT_OTHER_COLOR = "#94a3b8";

const userSegmentColor = (key: string) => {
  if (key === "other") return USER_SEGMENT_OTHER_COLOR;
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return USER_SEGMENT_COLORS[Math.abs(hash) % USER_SEGMENT_COLORS.length];
};

type UserSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
  dataKey: string;
};

type ChartHoverState = {
  activePayload?: Array<{ payload?: { monthKey?: string } }>;
  activeLabel?: unknown;
};

function totalCount(counts: {
  addedWords: number;
  editedWords: number;
  addedDefinitions: number;
  editedDefinitions: number;
}) {
  return counts.addedWords + counts.editedWords + counts.addedDefinitions + counts.editedDefinitions;
}

function typeLabel(t: ReturnType<typeof useTranslations>, type: AdminStatsItemType) {
  switch (type) {
    case "wordAdded":
      return t("statsTypeWordAdded");
    case "wordEdited":
      return t("statsTypeWordEdited");
    case "definitionAdded":
      return t("statsTypeDefAdded");
    case "definitionEdited":
      return t("statsTypeDefEdited");
  }
}

export function AdminStatsClient({
  months,
  monthsBack,
  periodOptions,
}: {
  months: AdminStatsMonth[];
  monthsBack: number;
  periodOptions: number[];
}) {
  const t = useTranslations();
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeZone = useClientTimeZone();
  const [openMonth, setOpenMonth] = useState<string | null>(months[0]?.monthKey ?? null);
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set());
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);

  const monthLabel = useMemo(
    () => (iso: string) => f.dateTime(new Date(iso), { month: "long", year: "numeric", timeZone }),
    [f, timeZone],
  );
  const monthShortLabel = useMemo(
    () => (iso: string) => f.dateTime(new Date(iso), { month: "short", year: "2-digit", timeZone }),
    [f, timeZone],
  );
  const dateLabel = useMemo(
    () => (iso: string) => f.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone }),
    [f, timeZone],
  );
  const chartConfig = useMemo(
    () => ({
      addedWords: { label: t("statsTypeWordAdded"), color: "var(--chart-1)" },
      editedWords: { label: t("statsTypeWordEdited"), color: "var(--chart-2)" },
      addedDefinitions: { label: t("statsTypeDefAdded"), color: "var(--chart-3)" },
      editedDefinitions: { label: t("statsTypeDefEdited"), color: "var(--chart-4)" },
    }),
    [t],
  );
  const sortedMonths = useMemo(
    () => [...months].sort((a, b) => a.monthStartIso.localeCompare(b.monthStartIso)),
    [months],
  );
  const monthMap = useMemo(() => new Map(months.map((month) => [month.monthKey, month])), [months]);
  const monthKeyByIso = useMemo(() => new Map(months.map((month) => [month.monthStartIso, month.monthKey])), [months]);
  const buildUserSegments = useCallback(
    (monthKey: string | null): UserSegment[] => {
      if (!monthKey) return [];
      const month = monthMap.get(monthKey);
      if (!month) return [];
      const totals = month.users
        .map((user) => ({
          key: user.userId ?? "unknown",
          label: user.userLabel ?? t("statsUnknownUser"),
          value: totalCount(user.counts),
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value);
      const top = totals.slice(0, MAX_USER_SEGMENTS);
      const remainder = totals.slice(MAX_USER_SEGMENTS).reduce((sum, entry) => sum + entry.value, 0);
      const segments = remainder > 0 ? [...top, { key: "other", label: t("statsOtherUsers"), value: remainder }] : top;
      return segments.map((segment) => ({
        ...segment,
        color: userSegmentColor(segment.key),
        dataKey: `user_${segment.key}`,
      }));
    },
    [monthMap, t],
  );
  const activeUserSegments = useMemo(() => buildUserSegments(activeMonthKey), [activeMonthKey, buildUserSegments]);
  const chartData = useMemo(() => {
    const hasUserSplit = activeMonthKey != null && activeUserSegments.length > 0;
    return sortedMonths.map((month) => {
      const isActive = hasUserSplit && month.monthKey === activeMonthKey;
      const baseCounts = isActive
        ? {
            addedWords: 0,
            editedWords: 0,
            addedDefinitions: 0,
            editedDefinitions: 0,
          }
        : month.counts;
      const userValues: Record<string, number> = {};
      if (hasUserSplit) {
        activeUserSegments.forEach((segment) => {
          userValues[segment.dataKey] = isActive ? segment.value : 0;
        });
      }
      return {
        month: month.monthStartIso,
        monthKey: month.monthKey,
        addedWords: baseCounts.addedWords,
        editedWords: baseCounts.editedWords,
        addedDefinitions: baseCounts.addedDefinitions,
        editedDefinitions: baseCounts.editedDefinitions,
        ...userValues,
      };
    });
  }, [sortedMonths, activeMonthKey, activeUserSegments]);
  const periodOptionsSorted = useMemo(() => {
    const unique = new Set<number>();
    for (const value of periodOptions) {
      if (Number.isFinite(value)) unique.add(value);
    }
    return Array.from(unique).sort((a, b) => a - b);
  }, [periodOptions]);
  const periodLabel = (value: number) => {
    switch (value) {
      case 3:
        return t("period3months");
      case 6:
        return t("period6months");
      case 12:
        return t("period1year");
      case 24:
        return t("period2years");
      default:
        return t("statsRangeLabel", { months: value });
    }
  };
  const updateStatsParams = (nextMonths: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "stats");
    params.set("statsMonths", String(nextMonths));
    params.delete("statsMode");
    router.replace(`${pathname}?${params.toString()}`);
  };
  const periodSelect = (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("statsPeriodLabel")}</span>
      <Select
        value={String(monthsBack)}
        onValueChange={(value) => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isFinite(parsed)) return;
          updateStatsParams(parsed);
        }}
      >
        <SelectTrigger size="sm" className="min-w-[7rem]" aria-label={t("statsPeriodLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periodOptionsSorted.map((value) => (
            <SelectItem key={value} value={String(value)}>
              {periodLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const handleChartMove = (state: unknown) => {
    const hoverState = state as ChartHoverState | null;
    const payloadKey = hoverState?.activePayload?.[0]?.payload?.monthKey;
    const labelRaw = hoverState?.activeLabel;
    const labelIso = typeof labelRaw === "string" || typeof labelRaw === "number" ? String(labelRaw) : null;
    const labelKey = labelIso ? monthKeyByIso.get(labelIso) : null;
    const nextKey = typeof payloadKey === "string" ? payloadKey : labelKey;
    if (typeof nextKey === "string") setActiveMonthKey(nextKey);
  };
  const handleChartLeave = () => setActiveMonthKey(null);
  const StatsTooltipContent = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: { month?: string; monthKey?: string } }>;
    label?: string | number;
  }) => {
    if (!active || !payload?.length) return null;
    const payloadItem = payload[0]?.payload;
    const monthIso =
      typeof payloadItem?.month === "string"
        ? payloadItem.month
        : typeof label === "string" || typeof label === "number"
          ? String(label)
          : null;
    const monthKey =
      typeof payloadItem?.monthKey === "string"
        ? payloadItem.monthKey
        : monthIso
          ? (monthKeyByIso.get(monthIso) ?? null)
          : null;
    const monthData = monthKey ? monthMap.get(monthKey) : null;
    if (!monthData) return null;
    const total = totalCount(monthData.counts);
    const segments = buildUserSegments(monthKey);

    return (
      <div className="grid gap-1.5 rounded-lg border bg-background p-2 text-xs shadow-sm">
        {monthIso ? <div className="font-medium">{monthLabel(monthIso)}</div> : null}
        <div className="text-xs text-muted-foreground">{t("statsMonthTotal", { count: total })}</div>
        {segments.length ? (
          <div className="grid gap-1">
            {segments.map((segment) => (
              <div key={segment.dataKey} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="text-muted-foreground">{segment.label}</span>
                <span className="ml-auto font-medium text-foreground">{segment.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  };
  if (!months.length) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm text-muted-foreground">{t("statsRangeLabel", { months: monthsBack })}</div>
          {periodSelect}
        </div>
        <div className="text-sm text-muted-foreground">{t("noData")}</div>
        <div className="text-xs text-muted-foreground">{t("statsAnticheatHint")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">{t("statsRangeLabel", { months: monthsBack })}</div>
        {periodSelect}
        <div className="text-xs text-muted-foreground md:ml-auto">{t("statsAnticheatHint")}</div>
      </div>
      <ChartContainer config={chartConfig} className="min-h-[240px] w-full">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onMouseMove={handleChartMove}
          onMouseLeave={handleChartLeave}
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickFormatter={(value) => monthShortLabel(String(value))}
            tickLine={false}
            axisLine={false}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip cursor={false} content={<StatsTooltipContent />} />
          <Bar dataKey="addedWords" stackId="stats" fill="var(--color-addedWords)" />
          <Bar dataKey="editedWords" stackId="stats" fill="var(--color-editedWords)" />
          <Bar dataKey="addedDefinitions" stackId="stats" fill="var(--color-addedDefinitions)" />
          <Bar
            dataKey="editedDefinitions"
            stackId="stats"
            fill="var(--color-editedDefinitions)"
            radius={[6, 6, 0, 0]}
          />
          {activeUserSegments.length
            ? activeUserSegments.map((segment, index) => (
                <Bar
                  key={segment.dataKey}
                  dataKey={segment.dataKey}
                  stackId="stats"
                  fill={segment.color}
                  stroke="var(--background)"
                  strokeWidth={1}
                  radius={index === activeUserSegments.length - 1 ? [6, 6, 0, 0] : 0}
                />
              ))
            : null}
        </BarChart>
      </ChartContainer>
      <div className="space-y-3">
        {months.map((month) => {
          const total = totalCount(month.counts);
          const isOpen = openMonth === month.monthKey;
          return (
            <div key={month.monthKey} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="space-y-1">
                  <div className="text-base font-semibold leading-tight">{monthLabel(month.monthStartIso)}</div>
                  <div className="text-xs text-muted-foreground">{t("statsMonthTotal", { count: total })}</div>
                </div>
                <div className="flex flex-wrap gap-2 ml-auto justify-end">
                  <Badge variant="secondary">{t("statsAddedWords", { count: month.counts.addedWords })}</Badge>
                  <Badge variant="secondary">{t("statsAddedDefs", { count: month.counts.addedDefinitions })}</Badge>
                  <Badge variant="secondary">{t("statsEditedWords", { count: month.counts.editedWords })}</Badge>
                  <Badge variant="secondary">{t("statsEditedDefs", { count: month.counts.editedDefinitions })}</Badge>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenMonth((prev) => (prev === month.monthKey ? null : month.monthKey))}
                >
                  {isOpen ? t("collapse") : t("expand")}
                </Button>
              </div>

              {isOpen ? (
                <div className="grid gap-3">
                  {month.users.map((user) => {
                    const userKey = `${month.monthKey}-${user.userId ?? "unknown"}`;
                    const userOpen = openUsers.has(userKey);
                    const userTotal = totalCount(user.counts);
                    return (
                      <div key={userKey} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="font-medium leading-tight">{user.userLabel ?? t("statsUnknownUser")}</div>
                            <div className="text-xs text-muted-foreground">
                              {t("statsMonthTotal", { count: userTotal })}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 ml-auto justify-end">
                            <Badge variant="outline">{t("statsAddedWords", { count: user.counts.addedWords })}</Badge>
                            <Badge variant="outline">
                              {t("statsAddedDefs", { count: user.counts.addedDefinitions })}
                            </Badge>
                            <Badge variant="outline">{t("statsEditedWords", { count: user.counts.editedWords })}</Badge>
                            <Badge variant="outline">
                              {t("statsEditedDefs", { count: user.counts.editedDefinitions })}
                            </Badge>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setOpenUsers((prev) => {
                                const next = new Set(prev);
                                if (next.has(userKey)) next.delete(userKey);
                                else next.add(userKey);
                                return next;
                              })
                            }
                          >
                            {userOpen ? t("collapse") : t("expand")}
                          </Button>
                        </div>
                        {userOpen ? (
                          <ul className="space-y-2">
                            {user.items.map((item) => (
                              <li key={item.id} className="rounded-md border px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Badge variant="secondary">{typeLabel(t, item.type)}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {t("statsAppliedAt", { value: dateLabel(item.approvedAtIso) })}
                                  </span>
                                </div>
                                <div className="mt-2 space-y-1">
                                  <div className="text-sm font-medium leading-tight">{item.word}</div>
                                  {item.definition ? (
                                    <div className="text-sm text-muted-foreground leading-tight">{item.definition}</div>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
