"use client";

import { Square, SquareCheckBig } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type SelectionToolbarProps = {
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  selectAllLabel: string;
  clearLabel: string;
  rightSlot?: ReactNode;
  align?: "start" | "center";
};

export function SelectionToolbar({
  selectedCount,
  onSelectAll,
  onClear,
  selectAllLabel,
  clearLabel,
  rightSlot,
  align = "center",
}: SelectionToolbarProps) {
  const alignClass = align === "start" ? "sm:items-start" : "sm:items-center";

  return (
    <div className={`flex flex-col sm:flex-row items-stretch ${alignClass} justify-between gap-2`}>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-10 sm:w-auto justify-center"
            type="button"
            aria-label={selectAllLabel}
            title={selectAllLabel}
            onClick={onSelectAll}
          >
            <SquareCheckBig className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{selectAllLabel}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-10 sm:w-auto justify-center"
            type="button"
            aria-label={clearLabel}
            title={clearLabel}
            onClick={onClear}
          >
            <Square className="size-4 sm:mr-2" />
            <span className="hidden sm:inline">{clearLabel}</span>
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{selectedCount}</span>
        </div>
      </div>
      {rightSlot ? (
        <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          {rightSlot}
        </div>
      ) : null}
    </div>
  );
}
