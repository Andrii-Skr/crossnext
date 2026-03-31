"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type * as React from "react";

export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}
