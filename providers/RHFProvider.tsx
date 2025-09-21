"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";

export function RHFProvider({
  schema,
  defaultValues,
  children,
}: {
  schema: z.ZodTypeAny;
  defaultValues?: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const methods = useForm({
    // Casting due to zod v4 + resolvers type mismatch in TS
    // Narrow casts to unknown to avoid any
    resolver: zodResolver(
      schema as unknown as Parameters<typeof zodResolver>[0],
    ) as unknown as Parameters<typeof useForm>[0]["resolver"],
    defaultValues,
    mode: "onSubmit",
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}
