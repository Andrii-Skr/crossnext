"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function LoadMoreButton({
  hasNext,
  isLoading,
  onClick,
}: {
  hasNext: boolean;
  isLoading: boolean;
  onClick: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex justify-center py-4">
      <Button type="button" variant="outline" onClick={onClick} disabled={!hasNext || isLoading} aria-live="polite">
        {isLoading ? t("loading") : hasNext ? t("loadMore") : t("noData")}
      </Button>
    </div>
  );
}
