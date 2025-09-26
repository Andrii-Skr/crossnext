import { Badge } from "@/components/ui/badge";

export function TagBadges({
  ids,
  tagNames,
  className,
}: {
  ids: number[];
  tagNames: Record<string, string>;
  className?: string;
}) {
  if (!ids.length) return null;
  return (
    <div className={className ?? "mt-2 flex flex-wrap gap-1"}>
      {ids.map((id) => (
        <Badge key={id} variant="outline">
          <span className="mb-1 h-3">{tagNames[String(id)] ?? String(id)}</span>
        </Badge>
      ))}
    </div>
  );
}

