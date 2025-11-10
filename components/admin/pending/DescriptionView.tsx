"use client";
import { useFormatter, useTranslations } from "next-intl";
import * as React from "react";
import { Badge } from "@/components/ui/badge";

export function DescriptionView({
  description,
  difficulty,
  endDateIso,
  createdAtIso,
  tagIds,
  tagNames,
}: {
  description: string;
  difficulty?: number | null;
  endDateIso?: string | null;
  createdAtIso: string;
  tagIds: number[];
  tagNames: Record<string, string>;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const end = endDateIso ? new Date(endDateIso) : null;
  const created = new Date(createdAtIso);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="rounded-md border p-3">
      <div className="text-sm whitespace-pre-wrap break-words">{description}</div>
      <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
        <span className="text-muted-foreground">{t("difficultyFilterLabel")}</span>
        <Badge variant="outline">{difficulty ?? 1}</Badge>
        {end ? (
          <Badge variant="outline">
            {t("until", {
              value: f.dateTime(end, { dateStyle: "short" }),
            })}
          </Badge>
        ) : null}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {t("pendingCreatedAt", {
          value: mounted
            ? f.dateTime(created, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              })
            : "—",
        })}
      </div>
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
