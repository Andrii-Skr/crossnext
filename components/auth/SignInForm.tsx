"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RHFProvider } from "@/providers/RHFProvider";

const schema = z.object({
  login: z.string().min(1),
  password: z.string().min(8),
});

export function SignInForm() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <RHFProvider schema={schema} defaultValues={{ login: "", password: "" }}>
      <form
        className="grid gap-4"
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
              toast.error("Invalid credentials");
            } else {
              toast.success("Signed in");
              router.push(callbackUrl);
            }
          });
        }}
      >
        <FormField
          name="login"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Login</FormLabel>
              <FormControl>
                <Input type="text" placeholder="login or email" aria-label="Login" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" disabled={pending} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign In"}
        </Button>
      </form>
    </RHFProvider>
  );
}
