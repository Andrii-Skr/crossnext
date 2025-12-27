"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminStatsItemType, AdminStatsMonth } from "@/lib/admin/stats";
import { useClientTimeZone } from "@/lib/date";

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

export function AdminStatsClient({ months, monthsBack }: { months: AdminStatsMonth[]; monthsBack: number }) {
  const t = useTranslations();
  const f = useFormatter();
  const timeZone = useClientTimeZone();
  const [openMonth, setOpenMonth] = useState<string | null>(months[0]?.monthKey ?? null);
  const [openUsers, setOpenUsers] = useState<Set<string>>(new Set());

  const monthLabel = useMemo(
    () => (iso: string) => f.dateTime(new Date(iso), { month: "long", year: "numeric", timeZone }),
    [f, timeZone],
  );
  const dateLabel = useMemo(
    () => (iso: string) => f.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short", timeZone }),
    [f, timeZone],
  );

  if (!months.length) {
    return (
      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">{t("statsRangeLabel", { months: monthsBack })}</div>
        <div className="text-sm text-muted-foreground">{t("noData")}</div>
        <div className="text-xs text-muted-foreground">{t("statsAnticheatHint")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">{t("statsRangeLabel", { months: monthsBack })}</div>
      <div className="text-xs text-muted-foreground">{t("statsAnticheatHint")}</div>
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
