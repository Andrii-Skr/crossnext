"use client";
import { useTranslations } from "next-intl";
import { ServerActionButton } from "@/components/admin/ServerActionButton";

export function DeletedWordItem({
  id,
  word,
  restoreAction,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  id: string;
  word: string;
  restoreAction: (formData: FormData) => Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <li className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 py-3">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={selected}
            onChange={(e) => onToggleSelect?.(id, e.currentTarget.checked)}
            aria-label={t("select")}
          />
        ) : null}
        <div className="flex-1 break-words">{word}</div>
      </div>
      <ServerActionButton
        id={id}
        action={restoreAction}
        labelKey="restore"
        successKey="restored"
        size="sm"
        className="w-full sm:w-auto"
      />
    </li>
  );
}
