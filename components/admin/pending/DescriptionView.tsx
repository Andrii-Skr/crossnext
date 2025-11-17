"use client";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { getBrowserTimeZone } from "@/lib/date";

export function DescriptionView({
  description,
  difficulty,
  endDateIso,
  tagIds,
  tagNames,
}: {
  description: string;
  difficulty?: number | null;
  endDateIso?: string | null;
  tagIds: number[];
  tagNames: Record<string, string>;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const end = endDateIso ? new Date(endDateIso) : null;

  return (
    <div className="rounded-md border p-3">
      <div className="text-sm whitespace-pre-wrap break-words">{description}</div>
      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
        <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
        <Badge variant="outline">{difficulty ?? 1}</Badge>
        {end ? (
          <Badge variant="outline">
            {t("until", {
              value: f.dateTime(end, { dateStyle: "short", timeZone: getBrowserTimeZone() }),
            })}
          </Badge>
        ) : null}
      </div>
      {/* Creation time hidden to avoid duplication; shown at card level */}
      {tagIds.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {tagIds.map((id) => (
            <Badge key={id} variant="outline">
              <span className="mb-1 h-3">{tagNames[String(id)] ?? String(id)}</span>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
