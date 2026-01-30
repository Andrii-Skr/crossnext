"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { DeleteTarget } from "./types";

type EditionFormValues = { name: string };
type IssueFormValues = { label: string };

export function ScanwordsDialogs({
  editionOpen,
  onEditionOpenChange,
  editionSubmitting,
  onSubmitEdition,
  editionForm,
  issueOpen,
  onIssueOpenChange,
  issueSubmitting,
  onSubmitIssue,
  issueForm,
  canCreateIssue,
  deleteConfirm,
  deletePending,
  onDeleteOpenChange,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  editionOpen: boolean;
  onEditionOpenChange: (open: boolean) => void;
  editionSubmitting: boolean;
  onSubmitEdition: () => void;
  editionForm: UseFormReturn<EditionFormValues>;
  issueOpen: boolean;
  onIssueOpenChange: (open: boolean) => void;
  issueSubmitting: boolean;
  onSubmitIssue: () => void;
  issueForm: UseFormReturn<IssueFormValues>;
  canCreateIssue: boolean;
  deleteConfirm: DeleteTarget | null;
  deletePending: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  const t = useTranslations();

  useEffect(() => {
    if (!editionOpen) {
      editionForm.reset({ name: "" });
    }
  }, [editionOpen, editionForm]);

  useEffect(() => {
    if (!issueOpen) {
      issueForm.reset({ label: "" });
    }
  }, [issueOpen, issueForm]);

  return (
    <>
      <Dialog open={!!deleteConfirm} onOpenChange={onDeleteOpenChange}>
        <DialogContent>
          {deleteConfirm && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {deleteConfirm.kind === "edition" ? t("scanwordsEditionDeleteTitle") : t("scanwordsIssueDeleteTitle")}
                </DialogTitle>
                <DialogDescription>
                  {deleteConfirm.kind === "edition"
                    ? t("scanwordsEditionDeleteConfirm", { name: deleteConfirm.label })
                    : t("scanwordsIssueDeleteConfirm", { label: deleteConfirm.label })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onDeleteCancel} disabled={deletePending}>
                  {t("cancel")}
                </Button>
                <Button type="button" variant="destructive" onClick={onDeleteConfirm} disabled={deletePending}>
                  {t("delete")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editionOpen} onOpenChange={onEditionOpenChange}>
        <DialogContent className="sm:max-w-[520px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("scanwordsCreateEditionTitle")}</DialogTitle>
          </DialogHeader>
          <Form {...editionForm}>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitEdition();
              }}
            >
              <FormField
                control={editionForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("scanwordsEditionNameLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("scanwordsEditionNamePlaceholder")} autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onEditionOpenChange(false)}
                  disabled={editionSubmitting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={editionSubmitting}>
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={issueOpen} onOpenChange={onIssueOpenChange}>
        <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t("scanwordsCreateIssueTitle")}</DialogTitle>
          </DialogHeader>
          <Form {...issueForm}>
            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                onSubmitIssue();
              }}
            >
              <FormField
                control={issueForm.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("scanwordsIssueLabelLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("scanwordsIssueLabelPlaceholder")} autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onIssueOpenChange(false)}
                  disabled={issueSubmitting}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={issueSubmitting || !canCreateIssue}>
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
