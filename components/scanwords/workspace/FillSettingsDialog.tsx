"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FillSettings, FillSpeedOption, FillSpeedPreset, SvgFontItem } from "./model";

type FillSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEditionName: string | null;
  selectedIssueLabel: string | null;
  settingsDraft: FillSettings;
  settingsSaving: boolean;
  svgFonts: SvgFontItem[];
  svgFontsLoading: boolean;
  fontUploading: boolean;
  speedOptions: FillSpeedOption[];
  onSpeedPresetChange: (value: FillSpeedPreset) => void;
  onDefinitionMaxPerCellChange: (value: number) => void;
  onDefinitionMaxPerHalfCellChange: (value: number) => void;
  onClueFontBasePtChange: (value: number) => void;
  onClueFontMinPtChange: (value: number) => void;
  onClueGlyphWidthPctChange: (value: number) => void;
  onClueLineHeightPctChange: (value: number) => void;
  onSvgFontIdChange: (value: string) => void;
  onSvgSystemFontFamilyChange: (value: string) => void;
  onUploadSvgFont: (file: File) => Promise<void>;
  onSave: () => void;
};

export function FillSettingsDialog({
  open,
  onOpenChange,
  selectedEditionName,
  selectedIssueLabel,
  settingsDraft,
  settingsSaving,
  svgFonts,
  svgFontsLoading,
  fontUploading,
  speedOptions,
  onSpeedPresetChange,
  onDefinitionMaxPerCellChange,
  onDefinitionMaxPerHalfCellChange,
  onClueFontBasePtChange,
  onClueFontMinPtChange,
  onClueGlyphWidthPctChange,
  onClueLineHeightPctChange,
  onSvgFontIdChange,
  onSvgSystemFontFamilyChange,
  onUploadSvgFont,
  onSave,
}: FillSettingsDialogProps) {
  const t = useTranslations();
  const f = useFormatter();
  const scopeEdition = selectedEditionName?.trim().length
    ? selectedEditionName
    : t("scanwordsFillArchiveUnknownEdition");
  const scopeIssue = selectedIssueLabel?.trim().length ? selectedIssueLabel : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex max-h-[calc(100svh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{t("scanwordsFillSettingsTitle")}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {t("scanwordsFillSettingsScope", { edition: scopeEdition, issue: scopeIssue })}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-6">
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">{t("scanwordsFillSettingsSectionFill")}</h3>
              <div className="grid gap-2">
                <Label>{t("scanwordsFillSpeedLabel")}</Label>
                <RadioGroup
                  value={settingsDraft.speedPreset}
                  onValueChange={(value) => onSpeedPresetChange(value as FillSpeedPreset)}
                  className="grid gap-2"
                >
                  {speedOptions.map((option) => (
                    <div
                      key={option.value}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                    >
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-fill-max-per-cell">{t("scanwordsFillDefinitionMaxPerCellLabel")}</Label>
                  <Input
                    id="scanwords-fill-max-per-cell"
                    type="number"
                    min={1}
                    max={1024}
                    step={1}
                    value={settingsDraft.definitionMaxPerCell}
                    onChange={(event) => onDefinitionMaxPerCellChange(Number(event.currentTarget.value))}
                    disabled={settingsSaving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-fill-max-per-half-cell">
                    {t("scanwordsFillDefinitionMaxPerHalfCellLabel")}
                  </Label>
                  <Input
                    id="scanwords-fill-max-per-half-cell"
                    type="number"
                    min={1}
                    max={1024}
                    step={1}
                    value={settingsDraft.definitionMaxPerHalfCell}
                    onChange={(event) => onDefinitionMaxPerHalfCellChange(Number(event.currentTarget.value))}
                    disabled={settingsSaving}
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-3 border-t pt-5">
              <h3 className="text-sm font-medium">{t("scanwordsFillSettingsSectionClueText")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-svg-clue-font-base">{t("scanwordsSvgClueFontBasePtLabel")}</Label>
                  <Input
                    id="scanwords-svg-clue-font-base"
                    type="number"
                    min={1}
                    max={72}
                    step={0.1}
                    value={settingsDraft.clueFontBasePt}
                    onChange={(event) => onClueFontBasePtChange(Number(event.currentTarget.value))}
                    disabled={settingsSaving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-svg-clue-font-min">{t("scanwordsSvgClueFontMinPtLabel")}</Label>
                  <Input
                    id="scanwords-svg-clue-font-min"
                    type="number"
                    min={1}
                    max={72}
                    step={0.1}
                    value={settingsDraft.clueFontMinPt}
                    onChange={(event) => onClueFontMinPtChange(Number(event.currentTarget.value))}
                    disabled={settingsSaving}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-svg-clue-glyph-width">{t("scanwordsSvgClueGlyphWidthPctLabel")}</Label>
                  <div className="flex items-center">
                    <Input
                      id="scanwords-svg-clue-glyph-width"
                      type="number"
                      min={40}
                      max={200}
                      step={1}
                      value={settingsDraft.clueGlyphWidthPct}
                      onChange={(event) => onClueGlyphWidthPctChange(Number(event.currentTarget.value))}
                      disabled={settingsSaving}
                      className="rounded-r-none"
                    />
                    <span className="flex h-9 items-center rounded-r-md border border-l-0 px-3 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="scanwords-svg-clue-line-height">{t("scanwordsSvgClueLineHeightPctLabel")}</Label>
                  <div className="flex items-center">
                    <Input
                      id="scanwords-svg-clue-line-height"
                      type="number"
                      min={40}
                      max={200}
                      step={1}
                      value={settingsDraft.clueLineHeightPct}
                      onChange={(event) => onClueLineHeightPctChange(Number(event.currentTarget.value))}
                      disabled={settingsSaving}
                      className="rounded-r-none"
                    />
                    <span className="flex h-9 items-center rounded-r-md border border-l-0 px-3 text-sm text-muted-foreground">
                      %
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-3 border-t pt-5">
              <h3 className="text-sm font-medium">{t("scanwordsFillSettingsSectionSvgFont")}</h3>
              <div className="grid gap-2">
                <Label htmlFor="scanwords-svg-system-font-family">{t("scanwordsSvgSystemFontFamilyLabel")}</Label>
                <Input
                  id="scanwords-svg-system-font-family"
                  type="text"
                  value={settingsDraft.svgSystemFontFamily}
                  onChange={(event) => onSvgSystemFontFamilyChange(event.currentTarget.value)}
                  disabled={settingsSaving}
                  placeholder={t("scanwordsSvgSystemFontFamilyPlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("scanwordsSvgFontLibraryLabel")}</Label>
                <Select value={settingsDraft.svgFontId ?? "__none__"} onValueChange={onSvgFontIdChange}>
                  <SelectTrigger disabled={settingsSaving || svgFontsLoading} className="w-full">
                    <SelectValue placeholder={t("scanwordsSvgFontSelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("scanwordsSvgFontNone")}</SelectItem>
                    {svgFonts.map((font) => (
                      <SelectItem key={font.id} value={font.id}>
                        {font.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="scanwords-svg-font-upload">{t("scanwordsSvgFontUploadLabel")}</Label>
                <Input
                  id="scanwords-svg-font-upload"
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  disabled={settingsSaving || fontUploading}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (!file) return;
                    void onUploadSvgFont(file);
                    event.currentTarget.value = "";
                  }}
                />
                {fontUploading ? (
                  <p className="text-xs text-muted-foreground">{t("scanwordsSvgFontUploading")}</p>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4">
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
