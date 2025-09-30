"use client";
import { useFormatter, useTranslations } from "next-intl";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { DateFieldHidden } from "@/components/ui/date-field-hidden";

export function ExpiredDefinitionItem({
  item,
  extendAction,
  softDeleteAction,
}: {
  item: { id: string; word: string; text: string; endDateIso?: string | null };
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const f = useFormatter();
  const end = item.endDateIso ? new Date(item.endDateIso) : null;

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-rose-700 mb-1">
          {t("word")}: {item.word}
        </div>
        {end ? (
          <div className="text-xs text-muted-foreground mb-1">
            {t("expiresAt", {
              value: f.dateTime(end, { dateStyle: "short" }),
            })}
          </div>
        ) : null}
        <div className="break-words">{item.text}</div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <form action={extendAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <DateFieldHidden
            placeholder={t("noLimit")}
            captionLayout="dropdown"
            clearText={t("clear")}
            buttonClassName="h-8 px-2 text-xs w-48 justify-start"
            name="end_date"
            defaultValue={end}
          />
          <ServerActionSubmit
            action={extendAction}
            labelKey="save"
            successKey="definitionUpdated"
            size="sm"
          />
        </form>
        <ServerActionButton
          id={item.id}
          action={softDeleteAction}
          labelKey="delete"
          successKey="definitionDeleted"
          size="sm"
          variant="destructive"
        />
      </div>
    </li>
  );
}
