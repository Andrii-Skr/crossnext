import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-semibold mb-2">{t("notFoundTitle")}</h1>
      <p className="text-muted-foreground">{t("notFoundDescription")}</p>
    </div>
  );
}
