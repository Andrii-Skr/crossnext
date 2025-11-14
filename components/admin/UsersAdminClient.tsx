"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RHFProvider } from "@/providers/RHFProvider";

type AdminUser = {
  id: string;
  login: string;
  email: string | null;
  role: string | null;
  permissions: string[];
  createdAtIso: string;
};

const roleValues = ["ADMIN", "CHIEF_EDITOR", "EDITOR", "MANAGER", "USER"] as const;

const schema = z.object({
  login: z.string().min(1),
  email: z.union([z.string().email(), z.literal("")]),
  password: z.string().min(8),
  role: z.enum(roleValues).default("USER"),
});

export function UsersAdminClient({
  users,
  createUserAction,
}: {
  users: AdminUser[];
  createUserAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const f = useFormatter();

  const roleLabelKey: Record<(typeof roleValues)[number], string> = {
    ADMIN: "roleAdmin",
    CHIEF_EDITOR: "roleChiefEditor",
    EDITOR: "roleEditor",
    MANAGER: "roleManager",
    USER: "roleUser",
  };

  const permLabelKey: Record<string, string> = {
    "admin:access": "permAdminAccess",
    "pending:review": "permPendingReview",
    "dictionary:write": "permDictionaryWrite",
    "tags:write": "permTagsWrite",
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">{t("createUser")}</h3>
        <RHFProvider schema={schema} defaultValues={{ login: "", email: "", password: "", role: "USER" }}>
          <CreateUserForm createUserAction={createUserAction} roleLabelKey={roleLabelKey} />
        </RHFProvider>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2">{t("userListTitle")}</h3>
        {users.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t("noData")}</div>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="border rounded-md px-3 py-2 text-sm flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="font-medium">
                    {u.login || u.email || `#${u.id}`}
                    {u.email ? <span className="text-muted-foreground text-xs ml-2">&lt;{u.email}&gt;</span> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("userCreatedAt", {
                      value: f.dateTime(new Date(u.createdAtIso), { dateStyle: "short", timeStyle: "short" }),
                    })}
                  </div>
                </div>
                <div className="space-y-1 sm:text-right">
                  <div className="text-xs">
                    <span className="font-semibold mr-1">{t("userRole")}:</span>
                    {u.role && roleLabelKey[u.role as (typeof roleValues)[number]]
                      ? t(roleLabelKey[u.role as (typeof roleValues)[number]] as never)
                      : (u.role ?? t("userRoleUnknown"))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold mr-1">{t("userPermissions")}:</span>
                    {u.permissions.length === 0
                      ? t("userNoPermissions")
                      : u.permissions
                          .map((code) => {
                            const key = permLabelKey[code] ?? null;
                            return key ? t(key as never) : code;
                          })
                          .join(", ")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateUserForm({
  createUserAction,
  roleLabelKey,
}: {
  createUserAction: (formData: FormData) => Promise<void>;
  roleLabelKey: Record<(typeof roleValues)[number], string>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { handleSubmit, reset } = useFormContext<z.input<typeof schema>>();

  const onSubmit = () => {
    const run = handleSubmit((values) => {
      const email = values.email?.trim() ?? "";
      const role = values.role ?? "USER";
      const fd = new FormData();
      fd.set("login", values.login);
      if (email) fd.set("email", email);
      fd.set("password", values.password);
      fd.set("role", role);
      startTransition(async () => {
        try {
          await createUserAction(fd);
          toast.success(t("userCreated" as never));
          reset({ login: "", email: "", password: "", role });
        } catch {
          toast.error(t("saveError" as never));
        } finally {
          router.refresh();
        }
      });
    });
    run();
  };

  return (
    <form
      className="grid gap-4 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <FormField
        name="login"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("userLogin")}</FormLabel>
            <FormControl>
              <Input type="text" autoComplete="username" disabled={pending} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("userEmail")}</FormLabel>
            <FormControl>
              <Input type="email" autoComplete="email" disabled={pending} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("userPassword")}</FormLabel>
            <FormControl>
              <Input type="password" autoComplete="new-password" disabled={pending} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        name="role"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t("userRole")}</FormLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
            >
              <FormControl>
                <SelectTrigger disabled={pending}>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {roleValues.map((role) => (
                  <SelectItem key={role} value={role}>
                    {t(roleLabelKey[role] as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {t("createUser" as never)}
        </Button>
      </div>
    </form>
  );
}
