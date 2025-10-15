"use client";
import { ServerActionButton } from "@/components/admin/ServerActionButton";

export function DeletedDefinitionItem({
  id,
  word,
  text,
  restoreAction,
}: {
  id: string;
  word: string;
  text: string;
  restoreAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-emerald-700 mb-1">{word}</div>
        <div className="break-words">{text}</div>
      </div>
      <ServerActionButton id={id} action={restoreAction} labelKey="restore" successKey="restored" size="sm" />
    </li>
  );
}
