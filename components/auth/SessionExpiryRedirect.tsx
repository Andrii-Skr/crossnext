"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

const locales = ["ru", "en", "uk"] as const;

const getIsAuthRoute = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = (locales as readonly string[]).includes(segments[0] || "");
  const rest = hasLocale ? segments.slice(1) : segments;
  return rest[0] === "auth";
};

export function SessionExpiryRedirect() {
  const { status, data: session } = useSession();
  const locale = useLocale();
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAuthRoute = useMemo(() => getIsAuthRoute(pathname), [pathname]);
  const redirectTarget = useMemo(() => {
    const qs = searchParams.toString();
    const callbackUrl = `${pathname}${qs ? `?${qs}` : ""}`;
    return `/${locale}/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }, [locale, pathname, searchParams]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runRedirect = useCallback(() => {
    if (redirectingRef.current) return;
    clearTimer();
    redirectingRef.current = true;
    toast.error(t("sessionExpired"));
    router.replace(redirectTarget);
  }, [clearTimer, redirectTarget, router, t]);

  useEffect(() => {
    if (status !== "unauthenticated" || isAuthRoute) {
      redirectingRef.current = false;
      return;
    }
    runRedirect();
  }, [status, isAuthRoute, runRedirect]);

  useEffect(() => {
    clearTimer();
    if (status !== "authenticated" || isAuthRoute) return;
    const expiresRaw = session?.expires;
    const expiresAt = expiresRaw ? Date.parse(expiresRaw) : NaN;
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      runRedirect();
      return;
    }
    timerRef.current = setTimeout(runRedirect, delay);
    return () => clearTimer();
  }, [status, session?.expires, isAuthRoute, clearTimer, runRedirect]);

  return null;
}
