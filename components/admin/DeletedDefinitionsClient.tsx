"use client";
import { DeletedDefinitionItem } from "@/components/admin/DeletedDefinitionItem";
import { DeletedList } from "@/components/admin/DeletedList";

type Item = { id: string; word: string; text: string };

export function DeletedDefinitionsClient({
  items,
  restoreAction,
  hardDeleteAction,
}: {
  items: Item[];
  restoreAction: (formData: FormData) => Promise<void>;
  hardDeleteAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <DeletedList
      items={items}
      onBulkDelete={async (ids) => {
        const fd = new FormData();
        fd.set("ids", ids.join(","));
        await hardDeleteAction(fd);
      }}
      renderItem={({ item, selected, onToggleSelect }) => (
        <DeletedDefinitionItem
          key={item.id}
          id={item.id}
          word={item.word}
          text={item.text}
          restoreAction={restoreAction}
          selectable
          selected={selected}
          onToggleSelect={onToggleSelect}
        />
      )}
      confirmTitleKey="confirmBulkHardDeleteTitle"
      confirmDescKey="confirmBulkHardDeleteDesc"
    />
  );
}
