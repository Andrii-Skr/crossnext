"use client";
import { useTranslations } from "next-intl";

export default function ErrorPage({ error }: { error: Error & { digest?: string } }) {
  const t = useTranslations();

  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold mb-2">{t("somethingWentWrong")}</h1>
      <pre className="text-sm text-muted-foreground whitespace-pre-wrap">{error.message}</pre>
    </div>
  );
}
