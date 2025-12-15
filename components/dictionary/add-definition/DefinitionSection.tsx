"use client";
import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function DefinitionSection({
  defLabelId,
  inputProps,
  disabled,
  errorMessage,
  valueLength,
  maxLength,
  genLoading,
  aiDisabled,
  onGenerate,
  autoComplete,
  showGenerateButton = true,
}: {
  defLabelId: string;
  inputProps: UseFormRegisterReturn;
  disabled: boolean;
  errorMessage?: string;
  valueLength: number;
  maxLength: number;
  genLoading: boolean;
  aiDisabled: boolean;
  onGenerate: () => Promise<void> | void;
  autoComplete?: string;
  showGenerateButton?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="mt-3 grid gap-1">
      <span className="text-sm text-muted-foreground" id={`${defLabelId}-label`}>
        {t("definition")}
      </span>
      {showGenerateButton ? (
        <div className="flex items-center gap-2">
          <Input
            id={defLabelId}
            aria-labelledby={`${defLabelId}-label`}
            aria-invalid={!!errorMessage}
            disabled={disabled || genLoading}
            maxLength={maxLength}
            autoComplete={autoComplete}
            {...inputProps}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={genLoading || aiDisabled}
                onClick={() => void onGenerate()}
                aria-label={t("generateWithAiTooltip")}
              >
                {genLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="size-4 animate-pulse" />
                    {t("generating")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="size-4" />
                    {t("generateWithAi")}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("generateWithAiTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <Input
          id={defLabelId}
          aria-labelledby={`${defLabelId}-label`}
          aria-invalid={!!errorMessage}
          disabled={disabled}
          maxLength={maxLength}
          autoComplete={autoComplete}
          {...inputProps}
        />
      )}
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{errorMessage ? <span className="text-destructive">{errorMessage}</span> : null}</span>
        <span>
          {t("charsCount", {
            count: String(valueLength ?? 0),
            max: maxLength,
          })}
        </span>
      </div>
    </div>
  );
}
