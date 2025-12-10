import { type TagOption, TagSelector } from "@/components/tags/TagSelector";

export type Tag = TagOption;

export function TagPicker({
  wordId,
  selected,
  onAdd,
  onRemove,
}: {
  wordId: string;
  selected: Tag[];
  onAdd: (t: Tag) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <TagSelector
      selected={selected}
      onChange={(next) => {
        const currentIds = new Set(selected.map((s) => s.id));
        const nextIds = new Set(next.map((n) => n.id));
        // additions
        next.forEach((tag) => {
          if (!currentIds.has(tag.id)) onAdd(tag);
        });
        // removals
        selected.forEach((tag) => {
          if (!nextIds.has(tag.id)) onRemove(tag.id);
        });
      }}
      inputId={`tag-input-${wordId}`}
      labelKey="tags"
      placeholderKey="addTagsPlaceholder"
      createLabelKey="createTagNamed"
      inputSize="md"
    />
  );
}
