"use client";

import { useTranslations } from "next-intl";
import { ServerActionButton } from "@/components/admin/ServerActionButton";

type DeletedItemProps = {
  id: string;
  title: string;
  description?: string;
  restoreAction: (formData: FormData) => Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
  titleClassName?: string;
  align?: "start" | "center";
};

export function DeletedItem({
  id,
  title,
  description,
  restoreAction,
  selectable = false,
  selected = false,
  onToggleSelect,
  titleClassName,
  align = "start",
}: DeletedItemProps) {
  const t = useTranslations();
  const alignClass = align === "center" ? "sm:items-center" : "sm:items-start";

  return (
    <li className={`flex flex-col sm:flex-row items-stretch ${alignClass} gap-3 py-3`}>
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
        <div className="flex-1 min-w-0 break-words">
          <div className={titleClassName}>{title}</div>
          {description ? <div className="break-words">{description}</div> : null}
        </div>
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
