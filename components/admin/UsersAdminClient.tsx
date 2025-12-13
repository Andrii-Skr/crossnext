"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Role } from "@prisma/client";
import { SquarePen, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useForm, useFormContext } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useClientTimeZone } from "@/lib/date";
import { RHFProvider } from "@/providers/RHFProvider";

type AdminUser = {
  id: string;
  login: string;
  email: string | null;
  role: string | null;
  permissions: string[];
  createdAtIso: string;
  isDeleted: boolean;
  createdByLabel: string | null;
};

// Roles, которые могут фигурировать в форме создания пользователя.
// ADMIN не выдаём из UI, но он остаётся в union для типов.
const roleValues = ["ADMIN", "CHIEF_EDITOR_PLUS", "CHIEF_EDITOR", "EDITOR", "MANAGER", "USER"] as const;

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const isStrongPassword = (value: string) => strongPasswordRegex.test(value);

const schema = z.object({
  login: z.string().min(1),
  email: z.union([z.string().email(), z.literal("")]),
  password: z.string(),
  role: z.enum(roleValues).default("USER"),
});

export function UsersAdminClient({
  users,
  createUserAction,
  toggleUserDeletionAction,
  updateUserAction,
  roles,
}: {
  users: AdminUser[];
  createUserAction: (formData: FormData) => Promise<void>;
  toggleUserDeletionAction: (formData: FormData) => Promise<void>;
  updateUserAction: (formData: FormData) => Promise<void>;
  roles: Role[];
}) {
  const t = useTranslations();
  const f = useFormatter();
  const timeZone = useClientTimeZone();

  const roleLabelKey: Record<string, string> = {
    ADMIN: "roleAdmin",
    CHIEF_EDITOR_PLUS: "roleChiefEditorPlus",
    CHIEF_EDITOR: "roleChiefEditor",
    EDITOR: "roleEditor",
    MANAGER: "roleManager",
    USER: "roleUser",
  };

  const permLabelKey: Record<string, string> = {
    "admin:access": "permAdminAccess",
    "pending:review": "permPendingReview",
    "dictionary:write": "permDictionaryWrite",
    "tags:admin": "permTagsAdmin",
    "tags:write": "permTagsWrite",
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">{t("createUser")}</h3>
          <RHFProvider schema={schema} defaultValues={{ login: "", email: "", password: "", role: "USER" }}>
            <CreateUserForm createUserAction={createUserAction} roleLabelKey={roleLabelKey} roles={roles} />
          </RHFProvider>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">{t("userListTitle")}</h3>
          {users.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("noData")}</div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => {
                const isAdmin = u.role === "ADMIN";
                const permissionLabels = u.permissions.map((code) => {
                  const key = permLabelKey[code] ?? null;
                  return key ? t(key as never) : code;
                });
                return (
                  <div key={u.id} className="border rounded-md px-3 py-2 text-sm flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2 sm:space-y-1 flex-1 min-w-0">
                        <div className="font-medium">
                          {u.login || u.email || `#${u.id}`}
                          {u.email ? (
                            <span className="text-muted-foreground text-xs ml-2">&lt;{u.email}&gt;</span>
                          ) : null}
                          {u.isDeleted && (
                            <span className="ml-2 text-xs text-destructive">{t("userDisabled" as never)}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("userCreatedAt", {
                            value: f.dateTime(new Date(u.createdAtIso), {
                              dateStyle: "short",
                              timeStyle: "short",
                              timeZone,
                            }),
                          })}
                        </div>
                        {u.createdByLabel && (
                          <div className="text-xs text-muted-foreground">
                            {t("userCreatedBy", { value: u.createdByLabel })}
                          </div>
                        )}
                      </div>
                      {!isAdmin && (
                        <div className="flex items-center gap-1 self-start">
                          <EditUserDialog
                            user={u}
                            roles={roles}
                            roleLabelKey={roleLabelKey}
                            updateUserAction={updateUserAction}
                          />
                          <UserToggleButton id={u.id} isDeleted={u.isDeleted} action={toggleUserDeletionAction} />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 sm:text-left">
                      <div className="text-xs">
                        <span className="font-semibold mr-1">{t("userRole")}:</span>
                        {(() => {
                          if (!u.role) return t("userRoleUnknown");
                          const key = roleLabelKey[u.role];
                          return key ? t(key as never) : u.role;
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <div className="font-semibold text-foreground">{t("userPermissions")}:</div>
                        {permissionLabels.length === 0 ? (
                          <span>{t("userNoPermissions")}</span>
                        ) : (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {permissionLabels.map((label) => (
                              <Badge
                                key={label}
                                variant="secondary"
                                className="h-auto rounded-sm px-2 py-1 text-[11px] font-medium leading-tight"
                              >
                                {label}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function EditUserDialog({
  user,
  roles,
  roleLabelKey,
  updateUserAction,
}: {
  user: AdminUser;
  roles: Role[];
  roleLabelKey: Record<string, string>;
  updateUserAction: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const schema = useMemo(
    () =>
      z
        .object({
          role: z.enum(roleValues).optional(),
          password: z.string().optional(),
        })
        .superRefine((value, ctx) => {
          const password = (value.password ?? "").trim();
          if (password && !isStrongPassword(password)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t("userPasswordRequirements" as never),
              path: ["password"],
            });
          }
        }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      role: (user.role as (typeof roleValues)[number] | undefined) ?? undefined,
      password: "",
    },
    mode: "onSubmit",
  });

  const resetForm = useCallback(() => {
    form.reset({
      role: (user.role as (typeof roleValues)[number] | undefined) ?? undefined,
      password: "",
    });
  }, [form, user.role]);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  const submit = form.handleSubmit((values) => {
    const password = (values.password ?? "").trim();
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", user.id);
      if (values.role) {
        fd.set("role", values.role);
      }
      if (password) {
        fd.set("password", password);
      }
      try {
        await updateUserAction(fd);
        toast.success(t("userUpdated" as never));
        setOpen(false);
        resetForm();
      } catch {
        toast.error(t("saveError" as never));
      } finally {
        router.refresh();
      }
    });
  });

  const selectRoles = Array.from(new Set([...roles, ...(user.role ? [user.role as Role] : [])]));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("editUser" as never)}
            onClick={() => setOpen(true)}
          >
            <SquarePen className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("editUser" as never)}</TooltipContent>
      </Tooltip>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("editUser" as never)}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("userRole")}</FormLabel>
                  <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger disabled={pending}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {selectRoles.map((role) => {
                        const key = roleLabelKey[role];
                        const label = key ? t(key as never) : role;
                        const isAllowed = roles.includes(role);
                        return (
                          <SelectItem key={role} value={role} disabled={!isAllowed}>
                            {label}
                            {!isAllowed ? ` (${t("userRoleLocked" as never)})` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("userPassword")}</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" disabled={pending} {...field} />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">{t("userPasswordOptional" as never)}</p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("updateUser" as never)}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function UserToggleButton({
  id,
  isDeleted,
  action,
}: {
  id: string;
  isDeleted: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const labelKey = isDeleted ? "restore" : "delete";
  const colorClasses = isDeleted ? "text-emerald-600 hover:text-emerald-700" : "text-destructive";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t(labelKey as never)}
          disabled={pending}
          className={colorClasses}
          onClick={() => {
            startTransition(async () => {
              const fd = new FormData();
              fd.set("id", id);
              try {
                await action(fd);
                toast.success(t("userStatusUpdated" as never));
              } catch {
                toast.error(t("saveError" as never));
              } finally {
                router.refresh();
              }
            });
          }}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t(labelKey as never)}</TooltipContent>
    </Tooltip>
  );
}

function CreateUserForm({
  createUserAction,
  roleLabelKey,
  roles,
}: {
  createUserAction: (formData: FormData) => Promise<void>;
  roleLabelKey: Record<string, string>;
  roles: Role[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { handleSubmit, reset, setError } = useFormContext<z.input<typeof schema>>();

  const onSubmit = () => {
    const run = handleSubmit((values) => {
      const email = values.email?.trim() ?? "";
      const role = values.role ?? "USER";
      const password = (values.password ?? "").trim();
      if (!isStrongPassword(password)) {
        setError("password", { message: t("userPasswordRequirements" as never) });
        return;
      }
      const fd = new FormData();
      fd.set("login", values.login);
      if (email) fd.set("email", email);
      fd.set("password", password);
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
                {roles.map((role) => {
                  const key = roleLabelKey[role];
                  const label = key ? t(key as never) : role;
                  return (
                    <SelectItem key={role} value={role}>
                      {label}
                    </SelectItem>
                  );
                })}
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
