"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { SelectionToolbar } from "@/components/admin/SelectionToolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RHFProvider } from "@/providers/RHFProvider";

type DeletedListItem = { id: string };

type DeletedListProps<T extends DeletedListItem> = {
  items: T[];
  onBulkDelete: (ids: string[]) => Promise<void>;
  renderItem: (args: {
    item: T;
    selected: boolean;
    onToggleSelect: (id: string, next: boolean) => void;
  }) => React.ReactNode;
  confirmTitleKey: string;
  confirmDescKey: string;
};

export function DeletedList<T extends DeletedListItem>({
  items,
  onBulkDelete,
  renderItem,
  confirmTitleKey,
  confirmDescKey,
}: DeletedListProps<T>) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const idsJoined = Array.from(selected).join(",");
  const confirmKeyword = t("confirmKeywordDelete");

  const schema = useMemo(
    () =>
      z.object({
        confirm: z.string().refine((v) => v.trim() === confirmKeyword, {
          message: t("typeToConfirm", { keyword: confirmKeyword }) as string,
        }),
      }),
    [confirmKeyword, t],
  );

  function handleBulkDeleteSubmit(values: { confirm: string }) {
    if (values.confirm.trim() !== confirmKeyword || selected.size === 0) return;
    const ids = idsJoined.split(",").filter(Boolean);
    startTransition(async () => {
      try {
        await onBulkDelete(ids);
        toast.success(t("permanentlyDeleted" as never));
      } catch {
        // errors handled by calling side / server action toasts
      } finally {
        queryClient.invalidateQueries({ queryKey: ["dictionary"] });
        router.refresh();
        setSelected(new Set());
        setOpen(false);
      }
    });
  }

  function ConfirmFooter({ onCancel }: { onCancel: () => void }) {
    const { handleSubmit } = useFormContext<z.input<typeof schema>>();
    return (
      <DialogFooter className="mt-2 sm:mt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            const run = handleSubmit((vals) => handleBulkDeleteSubmit(vals as z.input<typeof schema>));
            run();
          }}
          disabled={pending || selected.size === 0}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {t("delete")}
        </Button>
      </DialogFooter>
    );
  }

  return (
    <div className="space-y-3">
      <SelectionToolbar
        selectedCount={selected.size}
        onSelectAll={() => setSelected(new Set(items.map((i) => i.id)))}
        onClear={() => setSelected(new Set())}
        selectAllLabel={t("selectAll")}
        clearLabel={t("clearSelection")}
        rightSlot={
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => setOpen(true)}
            disabled={selected.size === 0}
          >
            {t("deleteSelected")}
          </Button>
        }
      />
      <div className="h-px w-full bg-border" />

      <ul className="divide-y">
        {items.map((item) =>
          renderItem({
            item,
            selected: selected.has(item.id),
            onToggleSelect: (id, next) => {
              setSelected((prev) => {
                const s = new Set(prev);
                if (next) s.add(id);
                else s.delete(id);
                return s;
              });
            },
          }),
        )}
      </ul>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(confirmTitleKey)}</DialogTitle>
            <DialogDescription>{t(confirmDescKey, { keyword: confirmKeyword })}</DialogDescription>
          </DialogHeader>
          <RHFProvider schema={schema} defaultValues={{ confirm: "" }}>
            <form onSubmit={(e) => e.preventDefault()}>
              <FormField
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("typeToConfirm", { keyword: confirmKeyword })}</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus autoComplete="off" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <ConfirmFooter onCancel={() => setOpen(false)} />
            </form>
          </RHFProvider>
        </DialogContent>
      </Dialog>
    </div>
  );
}
