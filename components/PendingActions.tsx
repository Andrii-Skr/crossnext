"use client";
import { Check, X } from "lucide-react";
import { ServerActionButton } from "@/components/admin/ServerActionButton";
import { usePendingStore } from "@/store/pending";

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
  const decrement = usePendingStore((s) => s.decrement);

  const onSuccess = () =>
    decrement({ words: 1, descriptions: descriptionCount });

  return (
    <div className="flex items-center gap-2">
      <ServerActionButton
        id={id}
        action={rejectAction}
        labelKey="pendingReject"
        successKey="pendingRejected"
        variant="destructive"
        onSuccess={onSuccess}
        leftIcon={<X className="size-4" />}
      >
        {/* Icon left to keep visual parity */}
      </ServerActionButton>
      <ServerActionButton
        id={id}
        action={approveAction}
        labelKey="pendingApprove"
        successKey="pendingApproved"
        variant="default"
        onSuccess={onSuccess}
        leftIcon={<Check className="size-4" />}
      />
    </div>
  );
}
