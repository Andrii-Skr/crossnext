"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type FillDraftOptions,
  type FillSettings,
  type FillSpeedOption,
  type FillSpeedPreset,
  PARALLEL_MAX,
  PARALLEL_MIN,
} from "./model";

type FillSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settingsDraft: FillSettings;
  settingsSaving: boolean;
  speedOptions: FillSpeedOption[];
  draftOptions: FillDraftOptions;
  onSpeedPresetChange: (value: FillSpeedPreset) => void;
  onParallelChange: (value: string) => void;
  onSave: () => void;
};

export function FillSettingsDialog({
  open,
  onOpenChange,
  settingsDraft,
  settingsSaving,
  speedOptions,
  draftOptions,
  onSpeedPresetChange,
  onParallelChange,
  onSave,
}: FillSettingsDialogProps) {
  const t = useTranslations();
  const f = useFormatter();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("scanwordsFillSettingsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>{t("scanwordsFillSpeedLabel")}</Label>
            <RadioGroup
              value={settingsDraft.speedPreset}
              onValueChange={(value) => onSpeedPresetChange(value as FillSpeedPreset)}
            >
              {speedOptions.map((option) => (
                <div key={option.value} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id={`fill-speed-${option.value}`} value={option.value} />
                    <Label htmlFor={`fill-speed-${option.value}`}>{option.label}</Label>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t("scanwordsFillMaxNodes", { value: f.number(option.maxNodes) })}
                  </span>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fill-parallel">{t("scanwordsFillParallelLabel")}</Label>
            <Input
              id="fill-parallel"
              type="number"
              min={PARALLEL_MIN}
              max={PARALLEL_MAX}
              value={settingsDraft.parallel}
              onChange={(event) => onParallelChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("scanwordsFillParallelHint", {
                min: f.number(PARALLEL_MIN),
                max: f.number(PARALLEL_MAX),
              })}
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("scanwordsFillSettingsSummary", {
              maxNodes: f.number(draftOptions.maxNodes),
              parallel: f.number(draftOptions.parallel),
              restarts: f.number(draftOptions.restarts),
            })}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={onSave} disabled={settingsSaving}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
