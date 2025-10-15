"use client";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { lengthStats, scanSlots, validate } from "@/utils/cross/grid";
import { parseFshBytes } from "@/utils/cross/parseFsh";

export default function UploadPage() {
  const t = useTranslations();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [fileStats, setFileStats] = useState<
    { key: string; name: string; size: number; stats: Record<string, number> }[]
  >([]);
  const [totalStats, setTotalStats] = useState<Record<string, number> | null>(null);

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
    let cancelled = false;
    async function run() {
      if (!files.length) {
        setFileStats([]);
        setTotalStats(null);
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
        for (const f of files) {
          try {
            const key = `${f.name}:${f.size}`;
            const buf = await f.arrayBuffer();
            const grid = parseFshBytes(buf);
            validate(grid);
            const slots = scanSlots(grid);
            const stats = lengthStats(slots);
            results.push({ key, name: f.name, size: f.size, stats });
          } catch (_e) {
            if (!cancelled) toast.error(t("parseError", { name: f.name }));
          }
        }
        if (cancelled) return;
        setFileStats(results);
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

  async function handleUpload() {
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
      toast.success(t("uploadSuccess", { count: data.saved?.length ?? 0 }));
      setFiles([]);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Error";
      toast.error(t("uploadError", { default: msg }));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-[min(900px,calc(100vw-2rem))] py-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("upload")}</CardTitle>
        </CardHeader>
        <CardContent>
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
              <Button type="button" variant="outline" onClick={() => setFiles([])} disabled={uploading}>
                {t("clear")}
              </Button>
              <Button type="button" onClick={handleUpload} disabled={disabled}>
                {uploading ? t("uploading") : t("uploadAction")}
              </Button>
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

              <ul className="mt-3 max-h-60 overflow-auto rounded border">
                {files.map((f) => {
                  const key = `${f.name}:${f.size}`;
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
                        <span className="truncate mr-3" title={f.name}>
                          {f.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
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
        </CardContent>
      </Card>
    </div>
  );
}
