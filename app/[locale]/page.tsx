import { WordList } from "@/components/dictionary/WordList";

export const metadata = {
  title: "Dictionary",
};

export default function Page() {
  return (
    <div className="w-auto py-6 flex flex-col items-center">
      <h1 className="text-2xl font-semibold mb-4 text-center">Dictionary</h1>
      <div className="w-full max-w-5xl">
        <WordList />
      </div>
    </div>
  );
}

