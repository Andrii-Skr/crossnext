export type ActionError = Error & {
  status?: number;
  code?: string;
};

export function actionError(code: string, status: number, message?: string): ActionError {
  const err = new Error(message ?? code) as ActionError;
  err.status = status;
  err.code = code;
  return err;
}

export function getActionErrorMeta(error: unknown): Pick<ActionError, "status" | "code"> {
  if (!error || typeof error !== "object") return {};
  const withMeta = error as { status?: unknown; code?: unknown };
  const status = typeof withMeta.status === "number" ? withMeta.status : undefined;
  const code = typeof withMeta.code === "string" && withMeta.code.trim().length > 0 ? withMeta.code : undefined;
  return { status, code };
}
