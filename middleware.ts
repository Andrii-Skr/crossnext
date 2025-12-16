import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";
import { env } from "@/lib/env";

const locales = ["ru", "en", "uk"] as const;
const defaultLocale = "ru" as const;

const intl = createMiddleware({
  locales: Array.from(locales),
  defaultLocale,
});

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

export async function middleware(req: NextRequest) {
  // Run next-intl locale handling (adds default locale, redirects, etc.)
  const intlResponse = intl(req);

  // Auth gating for all non-auth pages (supports locale prefix)
  const token = await getToken({ req, secret: env.NEXTAUTH_SECRET });
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
    res.cookies.delete("next-auth.session-token");
    res.cookies.delete("__Secure-next-auth.session-token");
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

  const res = intlResponse ?? NextResponse.next();

  // Persist admin tab selection via cookie when provided in query
  try {
    if (restPath.startsWith("/admin")) {
      const tab = req.nextUrl.searchParams.get("tab");
      if (tab === "expired" || tab === "trash" || tab === "tags" || tab === "users") {
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
  // Match only internationalized pathnames and our protected areas; exclude next internal and api/static assets
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
