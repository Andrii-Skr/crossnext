import { env } from "@/lib/env";

const isHttps = (() => {
  try {
    return new URL(env.NEXTAUTH_URL).protocol === "https:";
  } catch {
    return false;
  }
})();

// Use Secure cookies only when app URL is HTTPS; otherwise browsers reject cookie writes.
export const useSecureCookies = env.NODE_ENV === "production" && isHttps;
export const sessionCookieName = useSecureCookies ? "__Secure-crossnext.session-token" : "crossnext.session-token";
export const legacySessionCookieNames = ["next-auth.session-token", "__Secure-next-auth.session-token"] as const;
export const allSessionCookieNames = [sessionCookieName, ...legacySessionCookieNames] as const;
