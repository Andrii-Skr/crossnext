"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

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
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { login: "", password: "" },
    mode: "onSubmit",
  });

  const submit = form.handleSubmit((values) => {
    start(async () => {
      try {
        const res = await signIn("credentials", {
          login: values.login,
          password: values.password,
          redirect: false,
          callbackUrl,
        });

        if (!res) {
          toast.error(t("signInFailed"));
          return;
        }

        const responseUrlHasError = (() => {
          if (!res.url) return false;
          try {
            const parsed = new URL(res.url, window.location.origin);
            return Boolean(parsed.searchParams.get("error"));
          } catch {
            return false;
          }
        })();

        if (res.error || responseUrlHasError || !res.ok || res.status >= 400) {
          toast.error(t("invalidCredentials"));
          return;
        }

        const targetUrl = res.url ?? callbackUrl;
        toast.success(t("signedIn"));
        router.replace(targetUrl);
        router.refresh();
      } catch {
        toast.error(t("signInFailed"));
      }
    });
  });

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        suppressHydrationWarning
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField
          control={form.control}
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
          control={form.control}
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
    </Form>
  );
}
