import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { env } from "@/lib/env";
import createMiddleware from "next-intl/middleware";

const locales = ["ru", "en", "uk"] as const;
const defaultLocale = "ru" as const;

const intl = createMiddleware({
  locales: Array.from(locales),
  defaultLocale,
});

export async function middleware(req: NextRequest) {
  // Run next-intl locale handling (adds default locale, redirects, etc.)
  const intlResponse = intl(req);

  // RBAC for protected paths (supports locale prefix)
  const token = await getToken({ req, secret: env.NEXTAUTH_SECRET });
  const { pathname } = req.nextUrl;
  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];
  const hasLocale = locales.includes(maybeLocale as any);
  const restPath = hasLocale ? "/" + segments.slice(1).join("/") : pathname;
  const protectedPaths = ["/dashboard", "/admin"];
  const isProtected = protectedPaths.some((p) => restPath.startsWith(p));

  if (isProtected && !token) {
    const currentLocale = hasLocale ? (maybeLocale as typeof defaultLocale) : defaultLocale;
    const url = new URL(`/${currentLocale}/auth/sign-in`, req.url);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  return intlResponse ?? NextResponse.next();
}

export const config = {
  // Match only internationalized pathnames and our protected areas; exclude next internal and api/static assets
  matcher: [
    "/((?!api|_next|.*\\..*).*)",
  ],
};
