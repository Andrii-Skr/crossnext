import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/auth";
import { SignInForm } from "@/components/auth/SignInForm";
import { getSearchParamValue, type SearchParamsInput } from "@/lib/search-params";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("signIn") };
}

function resolveRedirectTarget(rawCallbackUrl: string | undefined, locale: string): string {
  const fallback = `/${locale}`;
  if (!rawCallbackUrl) return fallback;
  if (rawCallbackUrl.startsWith("/")) return rawCallbackUrl;
  try {
    const url = new URL(rawCallbackUrl);
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

function isSignInPath(path: string): boolean {
  const noQuery = path.split("?")[0] ?? path;
  const trimmed = noQuery.endsWith("/") && noQuery.length > 1 ? noQuery.slice(0, -1) : noQuery;
  return /^\/(ru|en|uk)\/auth\/sign-in$/.test(trimmed);
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const [{ locale }, sp, session, t] = await Promise.all([
    params,
    searchParams,
    getServerSession(authOptions),
    getTranslations(),
  ]);

  if (session?.user) {
    const callbackUrl = getSearchParamValue(sp, "callbackUrl");
    const target = resolveRedirectTarget(callbackUrl, locale);
    redirect(isSignInPath(target) ? `/${locale}` : target);
  }

  return (
    <div className="mx-auto max-w-sm w-full py-16">
      <h1 className="text-2xl font-semibold mb-6">{t("signIn")}</h1>
      <SignInForm />
    </div>
  );
}
