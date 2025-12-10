import { DeletedItem } from "@/components/admin/DeletedItem";

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
    <DeletedItem
      id={id}
      title={word}
      restoreAction={restoreAction}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
      align="center"
    />
  );
}
