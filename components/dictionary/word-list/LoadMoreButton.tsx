"use client";
import { useTranslations } from "next-intl";

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
      <button
        type="button"
        className="px-4 py-2 border rounded disabled:opacity-50"
        onClick={onClick}
        disabled={!hasNext || isLoading}
        aria-live="polite"
      >
        {isLoading ? t("loading") : hasNext ? t("loadMore") : t("noData")} 
      </button>
    </div>
  );
}

