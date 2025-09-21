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

export async function middleware(req: NextRequest) {
  // Run next-intl locale handling (adds default locale, redirects, etc.)
  const intlResponse = intl(req);

  // Auth gating for all non-auth pages (supports locale prefix)
  const token = await getToken({ req, secret: env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  const hasLocale = locales.includes(
    maybeLocale as unknown as (typeof locales)[number],
  );
  const restPath = hasLocale ? `/${segments.slice(1).join("/")}` : pathname;

  const isAuthRoute = restPath.startsWith("/auth");

  // If not authenticated and trying to access any non-auth page, redirect to sign-in
  if (!token && !isAuthRoute) {
    const currentLocale = hasLocale
      ? (maybeLocale as typeof defaultLocale)
      : defaultLocale;
    const url = new URL(`/${currentLocale}/auth/sign-in`, req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return intlResponse ?? NextResponse.next();
}

export const config = {
  // Match only internationalized pathnames and our protected areas; exclude next internal and api/static assets
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
