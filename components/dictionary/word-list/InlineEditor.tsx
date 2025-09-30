"use client";
import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function InlineEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saving,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave();
          if (e.key === "Escape") onCancel();
        }}
        disabled={saving}
        autoFocus={autoFocus}
      />
      <Button
        size="icon"
        className="rounded-full"
        variant="outline"
        onClick={onSave}
        disabled={saving}
        aria-label={t("save")}
      >
        <Check className="size-4" />
      </Button>
      <Button
        size="icon"
        className="rounded-full"
        variant="ghost"
        onClick={onCancel}
        disabled={saving}
        aria-label={t("cancel")}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

