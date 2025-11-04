"use client";
import { ServerActionButton } from "@/components/admin/ServerActionButton";

export function DeletedDefinitionItem({
  id,
  word,
  text,
  restoreAction,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  id: string;
  word: string;
  text: string;
  restoreAction: (formData: FormData) => Promise<void>;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string, next: boolean) => void;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
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
        <div className="flex-1 min-w-0">
          <div className="text-sm text-emerald-700 mb-1">{word}</div>
          <div className="break-words">{text}</div>
        </div>
      </div>
      <ServerActionButton id={id} action={restoreAction} labelKey="restore" successKey="restored" size="sm" />
    </li>
  );
}
