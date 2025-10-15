"use client";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmState = {
  type: "word" | "def";
  id: string;
  text?: string;
} | null;

export function ConfirmDeleteDialog({
  open,
  type,
  onOpenChange,
  onConfirm,
  deleting,
}: {
  open: boolean;
  type: "word" | "def" | undefined;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type === "word" ? t("confirmDeleteWordTitle") : t("confirmDeleteDefTitle")}</DialogTitle>
          <DialogDescription>
            {type === "word" ? t("confirmDeleteWordDesc") : t("confirmDeleteDefDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            {t("cancel")}
          </Button>
          <Button onClick={onConfirm} disabled={deleting}>
            {t("yes")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
