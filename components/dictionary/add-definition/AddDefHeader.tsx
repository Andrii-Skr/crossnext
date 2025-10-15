"use client";
import { ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AddDefHeader({
  title,
  onCollapse,
  onClose,
}: {
  title: string;
  onCollapse: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="adddef-drag-handle flex items-center justify-between gap-2 border-b px-3 py-2 cursor-move select-none bg-muted/40">
      <div className="min-w-0 flex-1 truncate font-medium text-sm">{title}</div>
      <div className="shrink-0 flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t("collapse")}
              onClick={onCollapse}
            >
              <ChevronDown className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("collapse")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t("cancel")}
              onClick={onClose}
            >
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("cancel")}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
