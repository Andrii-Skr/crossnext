import { env } from "@/lib/env";

export const useSecureCookies = env.NODE_ENV === "production";
export const sessionCookieName = useSecureCookies ? "__Secure-crossnext.session-token" : "crossnext.session-token";
export const legacySessionCookieNames = ["next-auth.session-token", "__Secure-next-auth.session-token"] as const;
export const allSessionCookieNames = [sessionCookieName, ...legacySessionCookieNames] as const;
