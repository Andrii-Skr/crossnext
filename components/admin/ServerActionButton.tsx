"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

type Props = {
  id: string;
  action: (formData: FormData) => Promise<void>;
  labelKey: string; // i18n key for button label
  successKey: string; // i18n key for success toast
} & Pick<ButtonProps, "variant" | "size" | "className">;

export function ServerActionButton({
  id,
  action,
  labelKey,
  successKey,
  variant,
  size,
  className,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      try {
        await action(fd);
        toast.success(t(successKey as never));
      } catch (_err) {
        toast.error(t("saveError"));
      } finally {
        // Invalidate dictionary lists so they refetch across pages
        queryClient.invalidateQueries({ queryKey: ["dictionary"] });
        router.refresh();
      }
    });
  };

  return (
    <Button
      onClick={handleClick}
      disabled={pending}
      variant={variant}
      size={size}
      className={className}
    >
      {t(labelKey as never)}
    </Button>
  );
}
