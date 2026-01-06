"use client";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { fetcher } from "@/lib/fetcher";
import type { Lang } from "@/lib/similarityClient";

export type GenerateDefinitionParams = {
  word: string;
  language: Lang;
  existing: string[];
  maxLength: number;
  toastOnSuccess?: boolean;
};

export function useGenerateDefinition() {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  const generate = useCallback(
    async (params: GenerateDefinitionParams) => {
      try {
        setLoading(true);
        const res = await fetcher<{
          success: boolean;
          text: string;
          message?: string;
        }>("/api/ai/generate-definition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word: params.word,
            language: params.language,
            existing: params.existing,
            maxLength: params.maxLength,
          }),
        });

        if (res?.text) {
          if (params.toastOnSuccess) toast.success(t("aiGenerated"));
          return res.text as string;
        }
        toast.error(t("aiError"));
        return null;
      } catch (e: unknown) {
        const status = (e as { status?: number })?.status;
        if (status === 401) toast.error(t("aiUnauthorized"));
        else if (status === 400) toast.error(t("aiNotConfigured"));
        else if (status === 429) toast.error(t("aiQuotaExceeded"));
        else toast.error(t("aiError"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  return { generate, loading } as const;
}
