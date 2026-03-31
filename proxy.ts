import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { allSessionCookieNames, sessionCookieName, useSecureCookies } from "@/lib/authCookies";
import { env } from "@/lib/env";

const locales = ["ru", "en", "uk"] as const;
const defaultLocale = "ru" as const;

const intl = createMiddleware({
  locales: Array.from(locales),
  defaultLocale,
});

function createNonce(): string {
  return btoa(crypto.randomUUID());
}

function buildCsp(nonce: string, reportUri: string | null): string {
  const isDev = process.env.NODE_ENV !== "production";
  const connectSrc = isDev ? "connect-src 'self' https: http:" : "connect-src 'self' https:";
  const scriptSrc = [`script-src 'self' 'nonce-${nonce}'`, isDev ? "'unsafe-eval'" : ""].filter(Boolean).join(" ");
  const reportDirectives = reportUri ? [`report-uri ${reportUri}`, "report-to csp-endpoint"] : [];
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    connectSrc,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...reportDirectives,
  ].join("; ");
}

type StatusCacheEntry = { role: string | null; isDeleted: boolean; expiresAt: number };
const STATUS_TTL_MS = 30_000;
const statusCache = new Map<number, StatusCacheEntry>();

const getCachedStatus = (id: number) => {
  const entry = statusCache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    statusCache.delete(id);
    return null;
  }
  return entry;
};

const setCachedStatus = (id: number, role: string | null, isDeleted: boolean) => {
  statusCache.set(id, { role, isDeleted, expiresAt: Date.now() + STATUS_TTL_MS });
};

export async function proxy(req: NextRequest) {
  const nonce = createNonce();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-csp-nonce", nonce);
  const reportEndpoint = `${req.nextUrl.origin}/api/security/csp-report`;
  const reportUri = env.CSP_REPORT_ENABLED ? reportEndpoint : null;
  const csp = buildCsp(nonce, reportUri);
  const shouldUseReportOnly = env.CSP_REPORT_ONLY;

  // Auth gating for all non-auth pages (supports locale prefix)
  const token = await getToken({
    req,
    secret: env.NEXTAUTH_SECRET,
    cookieName: sessionCookieName,
    secureCookie: useSecureCookies,
  });
  const tokenObj = token as Record<string, unknown> | null;
  const isDeleted = Boolean(tokenObj?.isDeleted);
  const role = typeof tokenObj?.role === "string" ? (tokenObj.role as string) : null;
  const idRaw = tokenObj?.id;
  const userId = typeof idRaw === "string" ? Number(idRaw) : typeof idRaw === "number" ? idRaw : NaN;
  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  const hasLocale = locales.includes(maybeLocale as unknown as (typeof locales)[number]);
  const restPath = hasLocale ? `/${segments.slice(1).join("/")}` : pathname;

  const isAuthRoute = restPath.startsWith("/auth");

  const buildRedirect = () => {
    const currentLocale = hasLocale ? (maybeLocale as typeof defaultLocale) : defaultLocale;
    const url = new URL(`/${currentLocale}/auth/sign-in`, req.url);
    url.searchParams.set("callbackUrl", pathname);
    const res = NextResponse.redirect(url);
    for (const name of allSessionCookieNames) {
      res.cookies.delete(name);
    }
    return res;
  };

  // If not authenticated and trying to access any non-auth page, redirect to sign-in
  if (!token && !isAuthRoute) {
    return buildRedirect();
  }

  // If token помечен как удалённым/без роли — принудительный редирект на вход
  if (!isAuthRoute && (isDeleted || !role)) {
    return buildRedirect();
  }

  // Дополнительная проверка статуса по БД (быстрая ревокация при смене роли/бане)
  if (!isAuthRoute && role && Number.isFinite(userId)) {
    const cached = getCachedStatus(userId);
    if (cached) {
      if (cached.isDeleted || cached.role !== role) return buildRedirect();
    }

    try {
      const origin = req.nextUrl.origin;
      const url = `${origin}/api/auth/status`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      const res = await fetch(url, {
        headers: { cookie: req.headers.get("cookie") ?? "" },
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        if (cached) {
          if (cached.isDeleted || cached.role !== role) return buildRedirect();
        }
      } else {
        const data = (await res.json()) as { isDeleted?: boolean; role?: string | null };
        setCachedStatus(userId, data.role ?? null, Boolean(data.isDeleted));
        if (data.isDeleted || !data.role || data.role !== role) {
          return buildRedirect();
        }
      }
    } catch {
      if (cached) {
        if (cached.isDeleted || cached.role !== role) return buildRedirect();
      }
      // Fail-open on transient errors to avoid redirect loops
    }
  }

  const res = hasLocale
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : (intl(req) ?? NextResponse.next({ request: { headers: requestHeaders } }));
  if (shouldUseReportOnly) {
    res.headers.set("Content-Security-Policy-Report-Only", csp);
  } else {
    res.headers.set("Content-Security-Policy", csp);
  }
  if (env.CSP_REPORT_ENABLED) {
    res.headers.set(
      "Report-To",
      JSON.stringify({
        group: "csp-endpoint",
        max_age: 60 * 60 * 24 * 30,
        endpoints: [{ url: reportEndpoint }],
      }),
    );
    res.headers.set("Reporting-Endpoints", `csp-endpoint="${reportEndpoint}"`);
  }

  // Persist admin tab selection via cookie when provided in query
  try {
    if (restPath.startsWith("/admin")) {
      const tab = req.nextUrl.searchParams.get("tab");
      if (tab === "expired" || tab === "trash" || tab === "tags" || tab === "users" || tab === "stats") {
        res.cookies.set("adminTab", tab, {
          maxAge: 60 * 60 * 24 * 365, // 1 year
          path: "/",
          sameSite: "lax",
        });
      }
    }
  } catch {}

  return res;
}

export const config = {
  // Match only internationalized pathnames and our protected areas; exclude Next internals, Vercel internals, and static assets.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
