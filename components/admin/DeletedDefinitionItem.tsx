import { DeletedItem } from "@/components/admin/DeletedItem";

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
    <DeletedItem
      id={id}
      title={word}
      description={text}
      restoreAction={restoreAction}
      selectable={selectable}
      selected={selected}
      onToggleSelect={onToggleSelect}
      titleClassName="text-sm text-emerald-700 mb-1"
      align="start"
    />
  );
}
