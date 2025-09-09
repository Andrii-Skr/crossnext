import { WordList } from "@/components/dictionary/WordList";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("dictionary") };
}

export default async function Page() {
  const t = await getTranslations();
  return (
    <div className="w-auto py-6 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-4 text-center">{t("dictionary")}</h1>
      <div className="w-full max-w-5xl">
        <WordList />
      </div>
    </div>
  );
}
