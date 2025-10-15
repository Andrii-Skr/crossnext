"use client";
import { ServerActionButton } from "@/components/admin/ServerActionButton";

export function DeletedWordItem({
  id,
  word,
  restoreAction,
}: {
  id: string;
  word: string;
  restoreAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="flex-1 break-words">{word}</div>
      <ServerActionButton id={id} action={restoreAction} labelKey="restore" successKey="restored" size="sm" />
    </li>
  );
}
