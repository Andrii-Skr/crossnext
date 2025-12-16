import { getTranslations } from "next-intl/server";
import { DictionaryLangSelect } from "@/components/dictionary/DictionaryLangSelect";
import { WordList } from "@/components/dictionary/WordList";

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t("dictionary") };
}

export default async function DictionaryPage() {
  const t = await getTranslations();
  return (
    <div className="w-auto flex flex-col items-center">
      <div className="w-full max-w-5xl mt-2 flex items-center justify-center gap-3">
        <h1 className="text-2xl font-semibold">{t("dictionary")}</h1>
        <DictionaryLangSelect />
      </div>
      <div className="w-full max-w-5xl">
        <WordList />
      </div>
    </div>
  );
}
