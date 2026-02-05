"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  createEditionAction,
  createIssueAction,
  deleteEditionAction,
  deleteIssueAction,
  updateEditionHiddenAction,
  updateIssueHiddenAction,
  updateIssueTemplateAction,
} from "@/app/actions/scanwords";
import { useScanwordsTemplates } from "@/components/scanwords/hooks/useScanwordsTemplates";
import { ScanwordsDialogs } from "@/components/scanwords/ScanwordsDialogs";
import { ScanwordsLists } from "@/components/scanwords/ScanwordsLists";
import { ScanwordsWorkspace } from "@/components/scanwords/ScanwordsWorkspace";
import type { ContextTarget, DeleteTarget, Edition } from "./types";

export function ScanwordsClient({ editions }: { editions: Edition[] }) {
  const t = useTranslations();
  const router = useRouter();

  const editionSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .trim()
          .min(1, t("scanwordsEditionNameRequired"))
          .max(255, t("scanwordsEditionNameMax", { max: 255 })),
      }),
    [t],
  );

  const issueSchema = useMemo(
    () =>
      z.object({
        label: z
          .string()
          .trim()
          .min(1, t("scanwordsIssueLabelRequired"))
          .max(64, t("scanwordsIssueLabelMax", { max: 64 })),
      }),
    [t],
  );

  type EditionFormValues = z.infer<typeof editionSchema>;
  type IssueFormValues = z.infer<typeof issueSchema>;

  const editionForm = useForm<EditionFormValues>({
    resolver: zodResolver(editionSchema),
    defaultValues: { name: "" },
    mode: "onSubmit",
  });

  const issueForm = useForm<IssueFormValues>({
    resolver: zodResolver(issueSchema),
    defaultValues: { label: "" },
    mode: "onSubmit",
  });

  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [editionOpen, setEditionOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editionSubmitting, setEditionSubmitting] = useState(false);
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteTarget | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const selectionRestoredRef = useRef(false);
  const selectionStorageKey = "scanwords:workspaceSelection";

  const selectedEdition =
    selectedEditionId == null ? null : (editions.find((edition) => edition.id === selectedEditionId) ?? null);
  const issues = selectedEdition?.issues ?? [];
  const selectedIssue = issues.find((issue) => issue.id === selectedIssueId) ?? null;
  const {
    templates,
    templatesLoading,
    templatesError,
    stats,
    statsLoading,
    statsError,
    dictionaryStats,
    dictionaryStatsLoading,
    dictionaryStatsError,
  } = useScanwordsTemplates({
    selectedTemplateId,
  });

  useEffect(() => {
    if (!selectedIssueId) return;
    const issue = issues.find((item) => item.id === selectedIssueId);
    const nextTemplateId = issue?.filterTemplateId ?? null;
    if (nextTemplateId !== selectedTemplateId) {
      setSelectedTemplateId(nextTemplateId);
    }
  }, [issues, selectedIssueId, selectedTemplateId]);

  const handleTemplateSelect = async (templateId: number) => {
    setSelectedTemplateId(templateId);
    if (!selectedIssue) return;
    try {
      await updateIssueTemplateAction({ issueId: selectedIssue.id, templateId });
    } catch {
      toast.error(t("scanwordsTemplateAssignError"));
    }
  };

  const handleSelectEdition = (editionId: number | null) => {
    setSelectedEditionId(editionId);
    setSelectedIssueId(null);
    setSelectedTemplateId(null);
  };

  const handleSelectIssue = (issueId: string, templateId: number | null) => {
    setSelectedIssueId(issueId);
    setSelectedTemplateId(templateId);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectionRestoredRef.current) return;
    if (!editions.length) return;
    try {
      const raw = window.localStorage.getItem(selectionStorageKey);
      if (!raw) {
        selectionRestoredRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as { editionId?: number | null; issueId?: string | null } | null;
      if (!parsed || parsed.editionId == null) {
        selectionRestoredRef.current = true;
        return;
      }
      const edition = editions.find((item) => item.id === parsed.editionId);
      if (!edition) {
        selectionRestoredRef.current = true;
        return;
      }
      setSelectedEditionId(edition.id);
      if (parsed.issueId) {
        const issue = edition.issues.find((item) => item.id === parsed.issueId);
        if (issue) {
          setSelectedIssueId(issue.id);
          setSelectedTemplateId(issue.filterTemplateId ?? null);
        }
      }
    } catch {
      // ignore restore errors
    } finally {
      selectionRestoredRef.current = true;
    }
  }, [editions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
      editionId: selectedEditionId ?? null,
      issueId: selectedIssueId ?? null,
    };
    try {
      window.localStorage.setItem(selectionStorageKey, JSON.stringify(payload));
    } catch {
      // ignore persistence errors
    }
  }, [selectedEditionId, selectedIssueId]);

  const handleOpenEditionDialog = () => {
    setEditionOpen(true);
  };

  const handleOpenIssueDialog = () => {
    if (!selectedEdition) {
      toast.error(t("scanwordsSelectEdition"));
      return;
    }
    setIssueOpen(true);
  };

  const requestDelete = (target: ContextTarget) => {
    if (target.kind === "edition") {
      setDeleteConfirm({ kind: "edition", id: target.id, label: target.label });
    } else {
      setDeleteConfirm({ kind: "issue", id: target.id, label: target.label });
    }
  };

  const handleEditionHiddenChange = async (editionId: number, hidden: boolean) => {
    try {
      await updateEditionHiddenAction({ id: editionId, hidden });
      if (hidden && selectedEditionId === editionId) {
        handleSelectEdition(null);
      }
      toast.success(hidden ? t("scanwordsEditionHidden") : t("scanwordsEditionUnhidden"));
      router.refresh();
    } catch {
      toast.error(hidden ? t("scanwordsEditionHideError") : t("scanwordsEditionUnhideError"));
    }
  };

  const handleIssueHiddenChange = async (issueId: string, hidden: boolean) => {
    try {
      await updateIssueHiddenAction({ id: issueId, hidden });
      if (hidden && selectedIssueId === issueId) {
        setSelectedIssueId(null);
        setSelectedTemplateId(null);
      }
      toast.success(hidden ? t("scanwordsIssueHidden") : t("scanwordsIssueUnhidden"));
      router.refresh();
    } catch {
      toast.error(hidden ? t("scanwordsIssueHideError") : t("scanwordsIssueUnhideError"));
    }
  };

  const handleEditionDelete = async (editionId: number) => {
    await deleteEditionAction({ id: editionId });
    if (selectedEditionId === editionId) {
      handleSelectEdition(null);
    }
    router.refresh();
  };

  const handleIssueDelete = async (issueId: string) => {
    await deleteIssueAction({ id: issueId });
    if (selectedIssueId === issueId) {
      setSelectedIssueId(null);
      setSelectedTemplateId(null);
    }
    router.refresh();
  };

  const handleToggleHidden = async (target: ContextTarget) => {
    if (target.kind === "edition") {
      await handleEditionHiddenChange(target.id, !target.hidden);
    } else {
      await handleIssueHiddenChange(target.id, !target.hidden);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeletePending(true);
    try {
      if (deleteConfirm.kind === "edition") {
        await handleEditionDelete(deleteConfirm.id);
        toast.success(t("scanwordsEditionDeleted"));
      } else {
        await handleIssueDelete(deleteConfirm.id);
        toast.success(t("scanwordsIssueDeleted"));
      }
      setDeleteConfirm(null);
    } catch {
      toast.error(deleteConfirm.kind === "edition" ? t("scanwordsEditionDeleteError") : t("scanwordsIssueDeleteError"));
    } finally {
      setDeletePending(false);
    }
  };

  const handleDeleteOpenChange = (open: boolean) => {
    if (!open && !deletePending) {
      setDeleteConfirm(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  const submitEdition = editionForm.handleSubmit(async (values) => {
    try {
      setEditionSubmitting(true);
      const created = await createEditionAction({
        name: values.name.trim(),
      });
      toast.success(created.created ? t("scanwordsEditionCreated") : t("scanwordsEditionSelectedExisting"));
      setEditionOpen(false);
      editionForm.reset({ name: "" });
      handleSelectEdition(created.id);
      router.refresh();
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 409) {
        toast.error(t("scanwordsEditionDuplicate"));
      } else {
        toast.error(t("scanwordsEditionCreateError"));
      }
    } finally {
      setEditionSubmitting(false);
    }
  });

  const submitIssue = issueForm.handleSubmit(async (values) => {
    if (!selectedEdition) {
      toast.error(t("scanwordsSelectEdition"));
      return;
    }
    try {
      setIssueSubmitting(true);
      const created = await createIssueAction({
        editionId: selectedEdition.id,
        label: values.label.trim(),
      });
      toast.success(t("scanwordsIssueCreated"));
      setIssueOpen(false);
      issueForm.reset({ label: "" });
      setSelectedIssueId(created.id);
      setSelectedTemplateId(null);
      router.refresh();
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      if (status === 409) {
        toast.error(t("scanwordsIssueDuplicate"));
      } else {
        toast.error(t("scanwordsIssueCreateError"));
      }
    } finally {
      setIssueSubmitting(false);
    }
  });

  return (
    <>
      <div className="mx-auto w-[min(1400px,calc(100vw-2rem))] py-6">
        <div className="relative rounded-2xl border bg-background/80 shadow-sm">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute -top-24 right-0 h-56 w-56 rounded-full bg-emerald-300/25 blur-3xl" />
            <div className="absolute -bottom-28 left-0 h-72 w-72 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.06),transparent_60%)] dark:bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.08),transparent_60%)]" />
          </div>

          <div className="relative z-10 p-4 md:p-6">
            <ScanwordsLists
              editions={editions}
              selectedEdition={selectedEdition}
              selectedIssue={selectedIssue}
              selectedEditionId={selectedEditionId}
              selectedIssueId={selectedIssueId}
              onSelectEdition={handleSelectEdition}
              onSelectIssue={handleSelectIssue}
              onOpenEditionDialog={handleOpenEditionDialog}
              onOpenIssueDialog={handleOpenIssueDialog}
              onToggleHidden={handleToggleHidden}
              onRequestDelete={requestDelete}
            >
              <ScanwordsWorkspace
                selectedEdition={selectedEdition}
                selectedIssue={selectedIssue}
                templates={templates}
                selectedTemplateId={selectedTemplateId}
                templatesLoading={templatesLoading}
                templatesError={templatesError}
                stats={stats}
                statsLoading={statsLoading}
                statsError={statsError}
                dictionaryStats={dictionaryStats}
                dictionaryStatsLoading={dictionaryStatsLoading}
                dictionaryStatsError={dictionaryStatsError}
                onTemplateSelect={handleTemplateSelect}
              />
            </ScanwordsLists>
          </div>
        </div>
      </div>
      <ScanwordsDialogs
        editionOpen={editionOpen}
        onEditionOpenChange={setEditionOpen}
        editionSubmitting={editionSubmitting}
        onSubmitEdition={submitEdition}
        editionForm={editionForm}
        issueOpen={issueOpen}
        onIssueOpenChange={setIssueOpen}
        issueSubmitting={issueSubmitting}
        onSubmitIssue={submitIssue}
        issueForm={issueForm}
        canCreateIssue={!!selectedEdition}
        deleteConfirm={deleteConfirm}
        deletePending={deletePending}
        onDeleteOpenChange={handleDeleteOpenChange}
        onDeleteCancel={handleDeleteCancel}
        onDeleteConfirm={confirmDelete}
      />
    </>
  );
}
