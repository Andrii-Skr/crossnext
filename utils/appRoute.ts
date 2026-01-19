import type { Role } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
//import { logApiRequest } from "@/lib/logs/logApiRequest";
import type { ZodSchema } from "zod";
import { authOptions } from "@/auth";
import { legacySessionCookieNames, sessionCookieName } from "@/lib/authCookies";
import { hasPermissionAsync, hasRole, type PermissionCode } from "@/lib/authz";

const authDebug = process.env.AUTH_DEBUG === "1";

const parseCookieKeys = (cookieHeader: string): string[] =>
  cookieHeader
    .split(";")
    .map((part) => part.split("=")[0]?.trim())
    .filter((key): key is string => Boolean(key));

const hasSessionCookie = (cookieKeys: string[], cookieName: string) =>
  cookieKeys.some((key) => key === cookieName || key.startsWith(`${cookieName}.`));

const hasLegacySessionCookie = (cookieKeys: string[]) =>
  legacySessionCookieNames.some((name) => hasSessionCookie(cookieKeys, name));

const getAuthDebugInfo = (req: NextRequest) => {
  const cookie = req.headers.get("cookie") ?? "";
  const cookieKeys = parseCookieKeys(cookie);
  const hasSessionToken = hasSessionCookie(cookieKeys, sessionCookieName);
  const hasLegacySessionToken = hasLegacySessionCookie(cookieKeys);
  const hasNextAuthCookie = cookieKeys.some(
    (key) =>
      key.startsWith("next-auth.") ||
      key.startsWith("__Secure-next-auth.") ||
      key.startsWith("crossnext.") ||
      key.startsWith("__Secure-crossnext."),
  );
  return {
    method: req.method,
    path: req.nextUrl.pathname,
    host: req.headers.get("host"),
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    forwardedFor: req.headers.get("x-forwarded-for"),
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    secFetchSite: req.headers.get("sec-fetch-site"),
    secFetchMode: req.headers.get("sec-fetch-mode"),
    secFetchDest: req.headers.get("sec-fetch-dest"),
    hasCookie: cookie.length > 0,
    hasNextAuthCookie,
    hasSessionToken,
    hasLegacySessionToken,
    sessionCookieName,
    cookieKeys,
  };
};

/* ---------- Типы ---------- */
export type RouteContext<T extends Record<string, string> = Record<string, never>> = {
  params: Promise<T>;
};

export type ApiHandler<TBody = unknown, TParams extends Record<string, string> = Record<string, never>> = (
  req: NextRequest,
  body: TBody,
  params: TParams,
  user: Session["user"] | null,
) => Promise<NextResponse>;

export type ApiRouteOptions<TBody = unknown> = {
  requireAuth?: boolean;
  roles?: Role[];
  permissions?: PermissionCode[];
  schema?: ZodSchema<TBody>;
};

/* ---------- Обёртка ---------- */
export function apiRoute<TBody = unknown, TParams extends Record<string, string> = Record<string, never>>(
  handler: ApiHandler<TBody, TParams>,
  options: ApiRouteOptions<TBody> = {},
) {
  return async function route(req: NextRequest, { params }: RouteContext<TParams>): Promise<NextResponse> {
    let status = 200;
    let user: Session["user"] | null = null;
    let bodyRaw: unknown | undefined;

    try {
      const resolvedParams = await params;

      /* ---------- Чтение тела ---------- */
      const needsBody = !["GET", "HEAD", "OPTIONS", "DELETE"].includes(req.method);

      if (needsBody) {
        try {
          bodyRaw = await req.json();
        } catch {
          status = 400;
          return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status });
        }

        /* ---------- Валидация ---------- */
        if (options.schema) {
          const parsed = options.schema.safeParse(bodyRaw);
          if (!parsed.success) {
            status = 400;
            return NextResponse.json(
              {
                success: false,
                message: "Validation error",
                errors: parsed.error.format(),
              },
              { status },
            );
          }
          bodyRaw = parsed.data;
        }
      }

      /* ---------- Аутентификация ---------- */
      const session = await getServerSession(authOptions);
      user = (session?.user ?? null) as Session["user"] | null;

      const requiresAuth = options.requireAuth || Boolean(options.roles?.length || options.permissions?.length);

      if (requiresAuth && !user) {
        if (authDebug) {
          // Debug only: avoid logging full cookie values.
          // eslint-disable-next-line no-console
          console.warn("AUTH_DEBUG missing session for", getAuthDebugInfo(req));
        }
        status = 401;
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status });
      }

      const roleRaw = user ? (user as { role?: Role | string | null }).role : null;
      const userRole = (typeof roleRaw === "string" ? (roleRaw as Role) : roleRaw) ?? null;

      if (options.roles && user) {
        const ok = hasRole(userRole, options.roles);
        if (!ok) {
          status = 403;
          return NextResponse.json({ success: false, message: "Forbidden" }, { status });
        }
      }

      if (options.permissions && user) {
        const ok = await hasPermissionAsync(userRole, options.permissions);
        if (!ok) {
          status = 403;
          return NextResponse.json({ success: false, message: "Forbidden" }, { status });
        }
      }

      /* ---------- Выполняем основной хендлер ---------- */
      const res = await handler(req, bodyRaw as TBody, resolvedParams, user);
      status = res.status;
      if (authDebug && requiresAuth && user) {
        const u = user as { id?: string | number | null; role?: Role | string | null } | null;
        const userId = u?.id != null ? String(u.id) : null;
        const role = u?.role != null ? String(u.role) : null;
        // Debug only: avoid logging full cookie values.
        // eslint-disable-next-line no-console
        console.info("AUTH_DEBUG session ok for", {
          ...getAuthDebugInfo(req),
          status,
          userId,
          role,
        });
      }
      return res;
    } catch (err: unknown) {
      // Expose error during tests (vitest setup ignores only lines starting with "API Error:")
      // eslint-disable-next-line no-console
      console.error("API ERROR CAUGHT:", err);
      console.error("API Error:", err);

      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          status = 409;
          return NextResponse.json(
            {
              success: false,
              message: "Duplicate entry. Resource already exists.",
              meta: err.meta,
            },
            { status },
          );
        }

        if (err.code === "P2025") {
          status = 404;
          return NextResponse.json(
            {
              success: false,
              message: "Record not found.",
              meta: err.meta,
            },
            { status },
          );
        }
      }

      status = 500;
      return NextResponse.json({ success: false, message: "Internal server error." }, { status });
    } finally {
      //void logApiRequest(req, user, status, started, bodyRaw);
    }
  };
}
