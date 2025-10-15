"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

type Props = {
  action: (formData: FormData) => Promise<void>;
  labelKey: string; // i18n key for button label
  successKey: string; // i18n key for success toast
  formId?: string; // form id to associate button with
} & Pick<ButtonProps, "variant" | "size" | "className">;

export function ServerActionSubmit({ action, labelKey, successKey, variant, size, className, formId }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const onClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.preventDefault();
    const nativeForm = (e.currentTarget as HTMLButtonElement).form;
    const targetForm = nativeForm ?? (formId ? (document.getElementById(formId) as HTMLFormElement | null) : null);
    if (!targetForm) return;
    const fd = new FormData(targetForm);
    startTransition(async () => {
      try {
        await action(fd);
        toast.success(t(successKey as never));
        // If current URL has ?edit=..., strip it to exit edit mode
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has("edit")) {
            url.searchParams.delete("edit");
            const newHref = url.pathname + (url.search ? url.search : "");
            router.replace(newHref);
          }
        } catch {}
      } catch {
        toast.error(t("saveError"));
      } finally {
        // Invalidate dictionary lists so they refetch across pages
        queryClient.invalidateQueries({ queryKey: ["dictionary"] });
        router.refresh();
      }
    });
  };

  return (
    <Button type="button" onClick={onClick} disabled={pending} variant={variant} size={size} className={className}>
      {t(labelKey as never)}
    </Button>
  );
}
