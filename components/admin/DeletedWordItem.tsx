"use client";
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
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {selectable ? (
          <input
            type="checkbox"
            className="mt-1 size-4"
            checked={selected}
            onChange={(e) => onToggleSelect?.(id, e.currentTarget.checked)}
            aria-label="select"
          />
        ) : null}
        <div className="flex-1 break-words">{word}</div>
      </div>
      <ServerActionButton id={id} action={restoreAction} labelKey="restore" successKey="restored" size="sm" />
    </li>
  );
}
