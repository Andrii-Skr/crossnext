import { getTranslations } from "next-intl/server";

export default async function Loading() {
  const t = await getTranslations();
  return (
    <div className="container py-10">
      <p>{t("loading")}</p>
    </div>
  );
}
