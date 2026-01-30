"use client";
import { Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FilterStats } from "@/types/dictionary-templates";

export function FilterStatsSummary({
  stats,
  loading,
  error,
  hint,
}: {
  stats: FilterStats | null;
  loading: boolean;
  error: boolean;
  hint?: string;
}) {
  const t = useTranslations();
  const f = useFormatter();

  const renderDifficulty = () => {
    if (!stats || stats.difficultyCounts.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("noData")}</p>;
    }
    return (
      <ul className="grid gap-1 text-xs max-h-36 overflow-auto pr-2">
        {stats.difficultyCounts.map((row) => (
          <li key={row.difficulty} className="flex items-center gap-2 rounded-md px-2 odd:bg-muted/90 even:bg-muted/10">
            <span className="min-w-0 flex-1 truncate">{row.difficulty}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{f.number(row.count)}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderTags = () => {
    if (!stats || stats.tagCounts.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("noData")}</p>;
    }
    return (
      <ul className="grid gap-1 text-xs max-h-36 overflow-auto pr-2">
        {stats.tagCounts.map((row) => (
          <li key={row.tagId} className="flex items-center gap-2 rounded-md px-2 odd:bg-muted/90 even:bg-muted/10">
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{f.number(row.count)}</span>
          </li>
        ))}
      </ul>
    );
  };

  const renderLengths = () => {
    if (!stats || stats.lengthCounts.length === 0) {
      return <p className="text-xs text-muted-foreground">{t("noData")}</p>;
    }
    return (
      <ul className="grid gap-1 text-xs max-h-36 overflow-auto pr-2">
        {stats.lengthCounts.map((row) => (
          <li key={row.length} className="flex items-center gap-2 rounded-md px-2 odd:bg-muted/90 even:bg-muted/10">
            <span className="min-w-0 flex-1 truncate">{row.length}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{f.number(row.count)}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{t("templateStatsTitle")}</span>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      </div>
      {hint && !stats && !loading && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {loading && <p className="text-xs text-muted-foreground">{t("templateStatsLoading")}</p>}
      {!loading && error && <p className="text-xs text-destructive">{t("templateStatsError")}</p>}
      {!loading && !error && stats && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{t("totalWords", { count: f.number(stats.totalWords) })}</Badge>
            <Badge variant="secondary">{t("totalDefinitions", { count: f.number(stats.totalDefs) })}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("statsDifficultyTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">{renderDifficulty()}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("statsTagsTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">{renderTags()}</CardContent>
            </Card>
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">{t("statsLengthTitle")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">{renderLengths()}</CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
