import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";

export function makeReq(
  method: string,
  url: string,
  body?: unknown,
): NextRequest {
  const init: RequestInit = { method, headers: {} };
  if (body !== undefined) {
    (init.headers as Record<string, string>)["content-type"] =
      "application/json";
    init.body = JSON.stringify(body);
  }
  // Cast to NextRequest for handler typing; only standard Request features are used
  return new Request(url, init) as unknown as NextRequest;
}

export function makeCtx<T extends Record<string, string>>(
  params: T | Promise<T>,
) {
  return { params: Promise.resolve(params as T) } as unknown as {
    params: Promise<T>;
  };
}

export type MockSessionUser = { id?: string; role?: string } | null;

export async function readJson<T = unknown>(
  res: Response,
): Promise<{ status: number; json: T }> {
  const status = res.status;
  const json = (await res.json()) as T;
  return { status, json };
}

export function makePrismaKnownError(
  code: "P2002" | "P2025",
  meta?: Record<string, unknown>,
) {
  // Create an object that passes `instanceof PrismaClientKnownRequestError`
  const err = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  err.code = code;
  err.meta = meta;
  return err as InstanceType<typeof Prisma.PrismaClientKnownRequestError>;
}
