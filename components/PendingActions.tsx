"use client";
import { Button } from "@/components/ui/button";
import { usePendingStore } from "@/stores/pending";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";

export function PendingActions({
  id,
  descriptionCount,
  approveAction,
  rejectAction,
}: {
  id: string;
  descriptionCount: number;
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const decrement = usePendingStore((s) => s.decrement);

  const onApprove = () => {
    decrement({ words: 1, descriptions: descriptionCount });
  };
  const onReject = () => {
    decrement({ words: 1, descriptions: descriptionCount });
  };

  return (
    <>
      <form action={rejectAction} onSubmit={onReject}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="destructive">
          <X className="size-4" /> {t("pendingReject")}
        </Button>
      </form>
      <form action={approveAction} onSubmit={onApprove}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="default">
          <Check className="size-4" /> {t("pendingApprove")}
        </Button>
      </form>
    </>
  );
}
