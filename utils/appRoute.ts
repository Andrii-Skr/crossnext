import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/auth";
//import { logApiRequest } from "@/lib/logs/logApiRequest";
import type { ZodSchema } from "zod";
import { Prisma } from "@prisma/client";

/* ---------- Типы ---------- */
export type RouteContext<T extends Record<string, string> = {}> = {
  params: Promise<T>;
};

export type ApiHandler<
  TBody = unknown,
  TParams extends Record<string, string> = {}
> = (
  req: NextRequest,
  body: TBody,
  params: TParams,
  user: Session["user"] | null
) => Promise<NextResponse>;

export type ApiRouteOptions<TBody = unknown> = {
  requireAuth?: boolean;
  roles?: string[];
  schema?: ZodSchema<TBody>;
};

/* ---------- Обёртка ---------- */
export function apiRoute<
  TBody = unknown,
  TParams extends Record<string, string> = {}
>(handler: ApiHandler<TBody, TParams>, options: ApiRouteOptions<TBody> = {}) {
  return async function route(
    req: NextRequest,
    { params }: RouteContext<TParams>
  ): Promise<NextResponse> {
    const started = performance.now();
    let status = 200;
    let user: Session["user"] | null = null;
    let bodyRaw: unknown | undefined;

    try {
      const resolvedParams = await params;

      /* ---------- Чтение тела ---------- */
      const needsBody = !["GET", "HEAD", "OPTIONS", "DELETE"].includes(
        req.method
      );

      if (needsBody) {
        try {
          bodyRaw = await req.json();
        } catch {
          status = 400;
          return NextResponse.json(
            { success: false, message: "Invalid JSON body" },
            { status }
          );
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
              { status }
            );
          }
          bodyRaw = parsed.data;
        }
      }

      /* ---------- Аутентификация ---------- */
      const session = await getServerSession(authOptions);
      user = (session?.user ?? null) as Session["user"] | null;

      if (options.requireAuth && !(user as any)?.id) {
        status = 401;
        return NextResponse.json(
          { success: false, message: "Unauthorized" },
          { status }
        );
      }

      if (options.roles && user && !(options.roles as any[]).includes((user as any).role)) {
        status = 403;
        return NextResponse.json(
          { success: false, message: "Forbidden" },
          { status }
        );
      }

      /* ---------- Выполняем основной хендлер ---------- */
      const res = await handler(req, bodyRaw as TBody, resolvedParams, user);
      status = res.status;
      return res;
    } catch (err: any) {
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
            { status }
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
            { status }
          );
        }
      }

      status = 500;
      return NextResponse.json(
        { success: false, message: "Internal server error." },
        { status }
      );
    } finally {
      //void logApiRequest(req, user, status, started, bodyRaw);
    }
  };
}
