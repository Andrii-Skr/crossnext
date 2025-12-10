"use client";
import { DeletedList } from "@/components/admin/DeletedList";
import { DeletedWordItem } from "@/components/admin/DeletedWordItem";

type Item = { id: string; word: string };

export function DeletedWordsClient({
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
        <DeletedWordItem
          key={item.id}
          id={item.id}
          word={item.word}
          restoreAction={restoreAction}
          selectable
          selected={selected}
          onToggleSelect={onToggleSelect}
        />
      )}
      confirmTitleKey="confirmBulkHardDeleteWordsTitle"
      confirmDescKey="confirmBulkHardDeleteDesc"
    />
  );
}
