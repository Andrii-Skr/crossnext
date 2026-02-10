"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getScanwordUploadSnapshotAction, saveScanwordUploadSnapshotAction } from "@/app/actions/scanwords";
import type { UploadFileInfo, UploadPanelHandle, UploadParseError } from "@/components/upload/UploadPanel";

type UseScanwordUploadFlowParams = {
  selectedIssueId: string | null;
  selectedTemplateId: number | null;
  selectedTemplateName: string | null;
};

type UploadSnapshot = {
  count: number;
  files: UploadFileInfo[];
  errors: UploadParseError[];
  neededStats: Record<string, number> | null;
};

export function useScanwordUploadFlow({
  selectedIssueId,
  selectedTemplateId,
  selectedTemplateName,
}: UseScanwordUploadFlowParams) {
  const [selectedFilesCount, setSelectedFilesCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadTotals, setUploadTotals] = useState<Record<string, number> | null>(null);
  const [lastUploadTotals, setLastUploadTotals] = useState<Record<string, number> | null>(null);
  const [parseErrors, setParseErrors] = useState<UploadParseError[]>([]);
  const [currentFiles, setCurrentFiles] = useState<UploadFileInfo[]>([]);
  const [lastUploadCount, setLastUploadCount] = useState(0);
  const [lastUploadErrors, setLastUploadErrors] = useState<UploadParseError[]>([]);
  const [uploadClicked, setUploadClicked] = useState(false);
  const uploadPanelRef = useRef<UploadPanelHandle | null>(null);
  const lastUploadRef = useRef<UploadSnapshot>({
    count: 0,
    files: [],
    errors: [],
    neededStats: null,
  });
  const prevIssueIdRef = useRef<string | null | undefined>(undefined);
  const prevFilesSignatureRef = useRef<string | undefined>(undefined);

  const filesSignature = useMemo(
    () => currentFiles.map((file) => file.key ?? `${file.name}:${file.size}`).join("|"),
    [currentFiles],
  );
  const liveFilesCount = Math.max(selectedFilesCount, currentFiles.length);
  const hasLiveFiles = liveFilesCount > 0;

  useEffect(() => {
    if (prevIssueIdRef.current === selectedIssueId) return;
    prevIssueIdRef.current = selectedIssueId;
    setSelectedFilesCount(0);
    setUploading(false);
    setUploadTotals(null);
    setLastUploadTotals(null);
    setParseErrors([]);
    setCurrentFiles([]);
    setLastUploadCount(0);
    setLastUploadErrors([]);
    setUploadClicked(false);
    lastUploadRef.current = {
      count: 0,
      files: [],
      errors: [],
      neededStats: null,
    };
    prevFilesSignatureRef.current = undefined;
  }, [selectedIssueId]);

  useEffect(() => {
    if (prevFilesSignatureRef.current === undefined) {
      prevFilesSignatureRef.current = filesSignature;
      return;
    }
    if (prevFilesSignatureRef.current !== filesSignature) {
      prevFilesSignatureRef.current = filesSignature;
      if (currentFiles.length > 0) {
        setUploadClicked(false);
      } else {
        setUploadClicked(lastUploadCount > 0);
      }
    }
  }, [currentFiles.length, filesSignature, lastUploadCount]);

  useEffect(() => {
    if (!hasLiveFiles && lastUploadCount === 0) {
      setUploadClicked(false);
    }
  }, [hasLiveFiles, lastUploadCount]);

  useEffect(() => {
    if (!selectedIssueId) return;
    const issueId = selectedIssueId;
    let active = true;
    async function loadSnapshot() {
      try {
        const snapshot = await getScanwordUploadSnapshotAction({ issueId });
        if (!active || !snapshot) return;
        setLastUploadCount(snapshot.fileCount);
        setLastUploadErrors(snapshot.errors);
        setLastUploadTotals(snapshot.neededStats ?? null);
        lastUploadRef.current = {
          count: snapshot.fileCount,
          files: snapshot.files,
          errors: snapshot.errors,
          neededStats: snapshot.neededStats ?? null,
        };
        if (snapshot.fileCount > 0) {
          setUploadClicked(true);
        }
      } catch {
        // ignore snapshot load errors in UI
      }
    }
    loadSnapshot();
    return () => {
      active = false;
    };
  }, [selectedIssueId]);

  const handleUploadClick = useCallback(() => {
    const panelCount = uploadPanelRef.current?.getFilesCount() ?? 0;
    const count = Math.max(panelCount, liveFilesCount);
    const snapshot = {
      count,
      files: currentFiles,
      errors: parseErrors,
      neededStats: uploadTotals,
    };
    lastUploadRef.current = snapshot;
    void uploadPanelRef.current?.upload();
  }, [currentFiles, liveFilesCount, parseErrors, uploadTotals]);

  const handleUploadComplete = useCallback(async () => {
    if (!selectedIssueId) return;
    const snapshot = lastUploadRef.current;
    setLastUploadCount(snapshot.count);
    setLastUploadErrors(snapshot.errors);
    setLastUploadTotals(snapshot.neededStats ?? null);
    setUploadClicked(snapshot.count > 0);
    try {
      await saveScanwordUploadSnapshotAction({
        issueId: selectedIssueId,
        templateId: selectedTemplateId ?? null,
        templateName: selectedTemplateName ?? null,
        fileCount: snapshot.count,
        files: snapshot.files,
        errors: snapshot.errors,
        neededStats: snapshot.neededStats ?? null,
      });
    } catch {
      // ignore save errors in UI
    }
  }, [selectedIssueId, selectedTemplateId, selectedTemplateName]);

  const effectiveUploadCount = hasLiveFiles ? liveFilesCount : lastUploadCount;
  const effectiveErrors = hasLiveFiles ? parseErrors : lastUploadErrors;
  const effectiveTotals = hasLiveFiles ? uploadTotals : lastUploadTotals;
  const uploadHasFiles = effectiveUploadCount > 0;
  const uploadHasErrors = effectiveErrors.length > 0;
  const uploadStepComplete = uploadHasFiles;
  const showParseErrors = hasLiveFiles ? parseErrors.length > 0 : lastUploadErrors.length > 0;
  const visibleParseErrors = hasLiveFiles ? parseErrors : lastUploadErrors;

  return {
    uploadPanelRef,
    filesSignature,
    selectedFilesCount,
    setSelectedFilesCount,
    uploading,
    setUploading,
    uploadTotals,
    setUploadTotals,
    parseErrors,
    setParseErrors,
    currentFiles,
    setCurrentFiles,
    uploadClicked,
    setUploadClicked,
    hasLiveFiles,
    liveFilesCount,
    effectiveUploadCount,
    effectiveErrors,
    effectiveTotals,
    uploadHasFiles,
    uploadHasErrors,
    uploadStepComplete,
    showParseErrors,
    visibleParseErrors,
    handleUploadClick,
    handleUploadComplete,
  };
}
