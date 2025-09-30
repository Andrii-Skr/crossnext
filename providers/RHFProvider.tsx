"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import type { DefaultValues } from "react-hook-form";
import { FormProvider, useForm } from "react-hook-form";
import type { z } from "zod";

export function RHFProvider<TSchema extends z.ZodObject<z.ZodRawShape>>({
  schema,
  defaultValues,
  children,
}: {
  schema: TSchema;
  defaultValues?: DefaultValues<z.input<TSchema>>;
  children: ReactNode;
}) {
  const methods = useForm<z.input<TSchema>, unknown, z.output<TSchema>>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onSubmit",
  });
  return <FormProvider {...methods}>{children}</FormProvider>;
}
