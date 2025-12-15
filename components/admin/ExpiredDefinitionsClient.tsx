"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DEFAULT_DIFFICULTIES } from "@/app/constants/constants";
import { ExpiredDefinitionItem } from "@/components/admin/ExpiredDefinitionItem";
import { SelectionToolbar } from "@/components/admin/SelectionToolbar";
import { ServerActionSubmit } from "@/components/admin/ServerActionSubmit";
import { EndDateSelect } from "@/components/ui/end-date-select";

type Item = { id: string; word: string; text: string; difficulty: number; endDateIso?: string | null };

export function ExpiredDefinitionsClient({
  items,
  difficulties = [],
  nowIso,
  extendAction,
  softDeleteAction,
  extendActionBulk,
}: {
  items: Item[];
  difficulties?: number[];
  nowIso?: string;
  extendAction: (formData: FormData) => Promise<void>;
  softDeleteAction: (formData: FormData) => Promise<void>;
  extendActionBulk: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const baseNow = nowIso ? new Date(nowIso) : null;
  const [endDate, setEndDate] = useState<Date | null>(null);

  const bulkFormId = "bulk-extend-form";
  const idsJoined = Array.from(selected).join(",");
  const difficultyOptions = difficulties.length ? difficulties : DEFAULT_DIFFICULTIES;

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        <div className="grid gap-1 w-full sm:w-auto">
          <span className="text-sm text-muted-foreground">{t("endDate")}</span>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
            <div className="w-full sm:w-44">
              <EndDateSelect
                value={endDate}
                onChange={setEndDate}
                baseNow={baseNow}
                name="end_date"
                form={bulkFormId}
                triggerClassName="w-full sm:w-42 lg:w-42"
              />
            </div>
            <form id={bulkFormId} className="hidden">
              <input type="hidden" name="ids" value={idsJoined} readOnly />
            </form>
            <ServerActionSubmit
              action={extendActionBulk}
              labelKey="save"
              successKey="definitionUpdated"
              size="sm"
              className="h-9 w-full sm:w-auto"
              formId={bulkFormId}
            />
          </div>
        </div>
        <SelectionToolbar
          selectedCount={selected.size}
          onSelectAll={() => setSelected(new Set(items.map((i) => i.id)))}
          onClear={() => setSelected(new Set())}
          selectAllLabel={t("selectAll")}
          clearLabel={t("clearSelection")}
          align="start"
        />
        <div className="h-px w-full bg-border" />
      </div>
      <ul className="divide-y">
        {items.map((d) => (
          <ExpiredDefinitionItem
            key={d.id}
            item={d}
            nowIso={nowIso}
            extendAction={extendAction}
            softDeleteAction={softDeleteAction}
            difficulties={difficultyOptions}
            selectable
            selected={selected.has(d.id)}
            onToggleSelect={(id, next) => {
              setSelected((prev) => {
                const s = new Set(prev);
                if (next) s.add(id);
                else s.delete(id);
                return s;
              });
            }}
          />
        ))}
      </ul>
    </div>
  );
}
