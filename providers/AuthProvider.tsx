"use client";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { SessionExpiryRedirect } from "@/components/auth/SessionExpiryRedirect";

export function AuthProvider({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  return (
    <SessionProvider session={session} refetchInterval={60} refetchOnWindowFocus>
      <SessionExpiryRedirect />
      {children}
    </SessionProvider>
  );
}
