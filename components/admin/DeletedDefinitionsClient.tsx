"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Square, SquareCheckBig } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { DeletedDefinitionItem } from "@/components/admin/DeletedDefinitionItem";
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

type Item = { id: string; word: string; text: string };

export function DeletedDefinitionsClient({
  items,
  restoreAction,
  hardDeleteAction,
}: {
  items: Item[];
  restoreAction: (formData: FormData) => Promise<void>;
  hardDeleteAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const idsJoined = Array.from(selected).join(",");
  const confirmKeyword = t("confirmKeywordDelete");

  const schema = z.object({
    confirm: z.string().refine((v) => v.trim() === confirmKeyword, {
      message: t("typeToConfirm", { keyword: confirmKeyword }) as string,
    }),
  });

  function handleBulkDeleteSubmit(values: { confirm: string }) {
    if (values.confirm.trim() !== confirmKeyword || selected.size === 0) return;
    const fd = new FormData();
    fd.set("ids", idsJoined);
    startTransition(async () => {
      try {
        await hardDeleteAction(fd);
        toast.success(t("permanentlyDeleted" as never));
      } catch {
        // no-op, ServerAction helpers usually toast; keep consistent UX
      } finally {
        queryClient.invalidateQueries({ queryKey: ["dictionary"] });
        router.refresh();
        setSelected(new Set());
        setOpen(false);
      }
    });
  }

  function ConfirmFooter({ onCancel }: { onCancel: () => void }) {
    const { handleSubmit } = useFormContext();
    return (
      <DialogFooter className="mt-2 sm:mt-4">
        <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button
          type="button"
          onClick={() => {
            const fn = handleSubmit((vals) => handleBulkDeleteSubmit(vals as { confirm: string }));
            fn();
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="grid gap-1 w-full sm:w-auto">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-10 sm:w-auto justify-center"
              type="button"
              aria-label={t("selectAll")}
              title={t("selectAll")}
              onClick={() => setSelected(new Set(items.map((i) => i.id)))}
            >
              <SquareCheckBig className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("selectAll")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-10 sm:w-auto justify-center"
              type="button"
              aria-label={t("clearSelection")}
              title={t("clearSelection")}
              onClick={() => setSelected(new Set())}
            >
              <Square className="size-4 sm:mr-2" />
              <span className="hidden sm:inline">{t("clearSelection")}</span>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="text-xs text-muted-foreground">{selected.size}</div>
          <Button
            variant="destructive"
            size="sm"
            type="button"
            onClick={() => setOpen(true)}
            disabled={selected.size === 0}
            className="w-full sm:w-auto"
          >
            {t("deleteSelected")}
          </Button>
        </div>
      </div>

      <ul className="divide-y">
        {items.map((d) => (
          <DeletedDefinitionItem
            key={d.id}
            id={d.id}
            word={d.word}
            text={d.text}
            restoreAction={restoreAction}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmBulkHardDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("confirmBulkHardDeleteDesc", { keyword: confirmKeyword })}</DialogDescription>
          </DialogHeader>
          <RHFProvider schema={schema} defaultValues={{ confirm: "" }}>
            <form onSubmit={(e) => e.preventDefault()}>
              <FormField
                name="confirm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("typeToConfirm", { keyword: confirmKeyword })}</FormLabel>
                    <FormControl>
                      <Input {...field} autoFocus />
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
