"use client";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UploadPage() {
  const t = useTranslations();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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
  });

  const disabled = uploading || files.length === 0;
  const countText = useMemo(
    () => t("selectedFiles", { count: files.length }),
    [files.length, t],
  );

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
              (isDragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/30 hover:border-primary")
            }
          >
            <input {...getInputProps()} aria-label={t("selectFiles")} />
            <div className="text-lg font-medium mb-1">
              {t("dropFilesTitle")}
            </div>
            <div className="text-sm text-muted-foreground">
              {t("orClickToSelect")}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{countText}</div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiles([])}
                disabled={uploading}
              >
                {t("clear")}
              </Button>
              <Button type="button" onClick={handleUpload} disabled={disabled}>
                {uploading ? t("uploading") : t("uploadAction")}
              </Button>
            </div>
          </div>

          {files.length > 0 && (
            <ul className="mt-3 max-h-60 overflow-auto rounded border">
              {files.map((f) => (
                <li
                  key={`${f.name}:${f.size}`}
                  className="px-3 py-2 text-sm flex items-center justify-between border-b last:border-b-0"
                >
                  <span className="truncate mr-3" title={f.name}>
                    {f.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {f.size}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
