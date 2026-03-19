import { getTranslations } from "next-intl/server";
import { SignInForm } from "@/components/auth/SignInForm";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("signIn") };
}

export default async function Page() {
  const t = await getTranslations();
  return (
    <div className="mx-auto max-w-sm w-full py-16">
      <h1 className="text-2xl font-semibold mb-6">{t("signIn")}</h1>
      <SignInForm />
    </div>
  );
}
