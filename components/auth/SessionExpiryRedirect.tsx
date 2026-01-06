"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useRef } from "react";

const locales = ["ru", "en", "uk"] as const;
const defaultLocale = "ru";

const getIsAuthRoute = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const hasLocale = (locales as readonly string[]).includes(segments[0] || "");
  const rest = hasLocale ? segments.slice(1) : segments;
  return rest[0] === "auth";
};

const getLocaleFromPath = (pathname: string) => {
  const segments = pathname.split("/").filter(Boolean);
  const maybe = segments[0];
  return (locales as readonly string[]).includes(maybe || "") ? (maybe as (typeof locales)[number]) : defaultLocale;
};

export function SessionExpiryRedirect() {
  const { status } = useSession();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectingRef = useRef(false);

  const isAuthRoute = useMemo(() => getIsAuthRoute(pathname), [pathname]);
  const locale = useMemo(() => getLocaleFromPath(pathname), [pathname]);

  useEffect(() => {
    if (status !== "unauthenticated" || isAuthRoute) {
      redirectingRef.current = false;
      return;
    }
    if (redirectingRef.current) return;
    redirectingRef.current = true;

    const qs = searchParams.toString();
    const callbackUrl = `${pathname}${qs ? `?${qs}` : ""}`;
    const target = `/${locale}/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    router.replace(target);
  }, [status, isAuthRoute, locale, pathname, router, searchParams]);

  return null;
}
