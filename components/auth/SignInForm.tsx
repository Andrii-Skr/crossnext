"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RHFProvider } from "@/providers/RHFProvider";

export function SignInForm() {
  const t = useTranslations();
  const locale = useLocale();
  const schema = useMemo(
    () =>
      z.object({
        login: z.string().trim().min(1, t("loginRequired")),
        password: z.string().min(8, t("passwordMinError", { count: 8 })),
      }),
    [t],
  );
  const [pending, start] = useTransition();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? `/${locale}`;

  return (
    <RHFProvider schema={schema} defaultValues={{ login: "", password: "" }}>
      <form
        className="grid gap-4"
        suppressHydrationWarning
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement & {
            login: { value: string };
            password: { value: string };
          };
          start(async () => {
            const res = await signIn("credentials", {
              login: form.login.value,
              password: form.password.value,
              redirect: false,
              callbackUrl,
            });
            if (res?.error) {
              toast.error(t("invalidCredentials"));
            } else {
              toast.success(t("signedIn"));
              router.push(callbackUrl);
            }
          });
        }}
      >
        <FormField
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("loginLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder={t("loginPlaceholder")}
                  aria-label={t("loginLabel")}
                  autoComplete="username"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("passwordLabel")}</FormLabel>
              <FormControl>
                <Input
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </RHFProvider>
  );
}
