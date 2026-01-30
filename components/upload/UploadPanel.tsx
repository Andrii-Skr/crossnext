"use client";

import { CircleX, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { lengthStats, scanSlots, validate } from "@/utils/cross/grid";
import { parseFshBytes } from "@/utils/cross/parseFsh";

type UploadPanelProps = {
  onUploadComplete?: (count: number) => void;
  onFilesCountChange?: (count: number) => void;
  onFilesMetaChange?: (files: UploadFileInfo[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onTotalsChange?: (stats: Record<string, number> | null) => void;
  onParseErrorsChange?: (errors: UploadParseError[]) => void;
  showUploadAction?: boolean;
  showClearAction?: boolean;
  containerClassName?: string;
  listClassName?: string;
};

export type UploadParseError = {
  key: string;
  name: string;
  reason: string;
};

export type UploadFileInfo = {
  key: string;
  name: string;
  size: number;
};

export type UploadPanelHandle = {
  upload: () => Promise<void>;
  clear: () => void;
  getFilesCount: () => number;
  isUploading: () => boolean;
};

export const UploadPanel = forwardRef<UploadPanelHandle, UploadPanelProps>(function UploadPanel(
  {
    onUploadComplete,
    onFilesCountChange,
    onFilesMetaChange,
    onUploadingChange,
    onTotalsChange,
    onParseErrorsChange,
    showUploadAction = true,
    showClearAction = true,
    containerClassName,
    listClassName,
  },
  ref,
) {
  const t = useTranslations();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileStats, setFileStats] = useState<
    { key: string; name: string; size: number; stats: Record<string, number> }[]
  >([]);
  const [totalStats, setTotalStats] = useState<Record<string, number> | null>(null);
  const [parseErrors, setParseErrors] = useState<UploadParseError[]>([]);
  const filesMeta = useMemo<UploadFileInfo[]>(
    () => files.map((f) => ({ key: `${f.name}:${f.size}`, name: f.name, size: f.size })),
    [files],
  );

  const onDrop = useCallback((accepted: File[]) => {
    if (!accepted?.length) return;
    setFiles((prev) => {
      // De-dup by name + size
      const map = new Map(prev.map((f) => [`${f.name}:${f.size}`, f]));
      for (const f of accepted) map.set(`${f.name}:${f.size}`, f);
      return Array.from(map.values());
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: { "application/octet-stream": [".fsh"] },
  });

  const disabled = uploading || files.length === 0;
  const countText = useMemo(() => t("selectedFiles", { count: files.length }), [files.length, t]);
  const parseErrorMap = useMemo(() => new Map(parseErrors.map((err) => [err.key, err])), [parseErrors]);

  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  const removeFile = useCallback((key: string) => {
    setFiles((prev) => prev.filter((f) => `${f.name}:${f.size}` !== key));
    setFileStats((prev) => {
      const next = prev.filter((r) => r.key !== key);
      const total: Record<string, number> = { total: 0 };
      for (const r of next) {
        for (const [k, v] of Object.entries(r.stats)) {
          total[k] = (total[k] ?? 0) + v;
        }
      }
      setTotalStats(next.length ? total : null);
      return next;
    });
  }, []);

  useEffect(() => {
    onFilesCountChange?.(files.length);
  }, [files.length, onFilesCountChange]);

  useEffect(() => {
    onFilesMetaChange?.(filesMeta);
  }, [filesMeta, onFilesMetaChange]);

  useEffect(() => {
    onUploadingChange?.(uploading);
  }, [onUploadingChange, uploading]);

  useEffect(() => {
    onTotalsChange?.(totalStats);
  }, [onTotalsChange, totalStats]);

  useEffect(() => {
    onParseErrorsChange?.(parseErrors);
  }, [onParseErrorsChange, parseErrors]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!files.length) {
        setFileStats([]);
        setTotalStats(null);
        setParseErrors([]);
        return;
      }
      setParsing(true);
      try {
        const results: {
          key: string;
          name: string;
          size: number;
          stats: Record<string, number>;
        }[] = [];
        const errors: UploadParseError[] = [];
        for (const f of files) {
          try {
            const key = `${f.name}:${f.size}`;
            const buf = await f.arrayBuffer();
            const grid = parseFshBytes(buf);
            validate(grid);
            const slots = scanSlots(grid);
            const stats = lengthStats(slots);
            results.push({ key, name: f.name, size: f.size, stats });
          } catch (e: unknown) {
            const reason = (e as { message?: string } | null)?.message?.trim() || t("parseErrorUnknown");
            errors.push({ key: `${f.name}:${f.size}`, name: f.name, reason });
            if (!cancelled) toast.error(t("parseError", { name: f.name }));
          }
        }
        if (cancelled) return;
        setFileStats(results);
        setParseErrors(errors);
        // aggregate
        const total: Record<string, number> = { total: 0 };
        for (const r of results) {
          for (const [k, v] of Object.entries(r.stats)) {
            total[k] = (total[k] ?? 0) + v;
          }
        }
        setTotalStats(total);
      } finally {
        if (!cancelled) setParsing(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [files, t]);

  const handleUpload = useCallback(async () => {
    try {
      if (!files.length) return;
      setUploading(true);
      const fd = new FormData();
      for (const f of files) fd.append("files", f, f.name);
      const res = await fetch("/api/upload/samples", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
      const data: {
        ok: boolean;
        saved: { name: string; size: number }[];
        dest: string;
      } = await res.json();
      const savedCount = data.saved?.length ?? 0;
      toast.success(t("uploadSuccess", { count: savedCount }));
      onUploadComplete?.(savedCount);
      setFiles([]);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(t("uploadError", { default: msg }));
    } finally {
      setUploading(false);
    }
  }, [files, onUploadComplete, t]);

  useImperativeHandle(
    ref,
    () => ({
      upload: handleUpload,
      clear: clearFiles,
      getFilesCount: () => files.length,
      isUploading: () => uploading,
    }),
    [clearFiles, files.length, handleUpload, uploading],
  );

  return (
    <div className={cn("flex flex-col min-h-0", containerClassName)}>
      <div
        {...getRootProps()}
        className={
          "border-2 border-dashed rounded-md px-6 py-14 text-center transition-colors " +
          (isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary")
        }
      >
        <input {...getInputProps()} aria-label={t("selectFiles")} />
        <div className="text-lg font-medium mb-1">{t("dropFilesTitle")}</div>
        <div className="text-sm text-muted-foreground">{t("orClickToSelect")}</div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{countText}</div>
        <div className="flex gap-2">
          {showClearAction && (
            <Button type="button" variant="outline" onClick={clearFiles} disabled={uploading}>
              {t("clear")}
            </Button>
          )}
          {showUploadAction && (
            <Button type="button" onClick={handleUpload} disabled={disabled}>
              {uploading ? t("uploading") : t("uploadAction")}
            </Button>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <>
          <div className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("fshStats")}</CardTitle>
              </CardHeader>
              <CardContent>
                {parsing && <div className="text-sm text-muted-foreground">{t("parsing")}</div>}
                {!parsing && totalStats && (
                  <div className="text-sm">
                    <div className="mb-1">{t("totalWords", { count: totalStats.total ?? 0 })}</div>
                    <div className="text-muted-foreground">
                      <span className="mr-1">{t("byLength")}:</span>
                      {Object.keys(totalStats)
                        .filter((k) => k !== "total")
                        .map((k) => Number(k))
                        .sort((a, b) => a - b)
                        .map((len, i, arr) => (
                          <span key={len} className="mr-2">
                            {len}: {totalStats[String(len)]}
                            {i < arr.length - 1 ? "," : ""}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <ul className={cn("mt-3 max-h-60 overflow-auto rounded border", listClassName)}>
            {files.map((f) => {
              const key = `${f.name}:${f.size}`;
              const parseError = parseErrorMap.get(key);
              const stats = fileStats.find((x) => x.key === key)?.stats;
              const lengths = stats
                ? Object.keys(stats)
                    .filter((k) => k !== "total")
                    .map((k) => Number(k))
                    .sort((a, b) => a - b)
                : [];
              return (
                <li key={key} className="px-3 py-2 text-sm border-b last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={cn("truncate mr-3", parseError ? "text-destructive" : "text-foreground")}
                      title={f.name}
                    >
                      {f.name}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {parseError && (
                        <span title={parseError.reason} className="inline-flex">
                          <CircleX className="size-4 text-destructive" aria-label={t("parseError", { name: f.name })} />
                        </span>
                      )}
                      <span className="text-muted-foreground tabular-nums text-xs">{f.size}</span>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("delete")}
                              onClick={() => removeFile(key)}
                            >
                              <X className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">{t("delete")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                  {stats && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <div>{t("totalWords", { count: stats.total ?? 0 })}</div>
                      {lengths.length > 0 && (
                        <div className="mt-0.5">
                          <span className="mr-1">{t("byLength")}:</span>
                          {lengths.map((len, i) => (
                            <span key={len} className="mr-2">
                              {len}: {stats[String(len)]}
                              {i < lengths.length - 1 ? "," : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
});
