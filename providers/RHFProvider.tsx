"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormProvider, useForm } from "react-hook-form";

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
    resolver: zodResolver(schema as any) as any,
    defaultValues,
    mode: "onSubmit",
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}
