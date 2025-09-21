import { describe, expect, it } from "vitest";
import { compareWithPrepared, prepareExisting } from "@/lib/similarity";
import {
  compareWithPrepared as compareClient,
  prepareExisting as prepClient,
} from "@/lib/similarityClient";

describe("RU similarity", () => {
  it("matches 'Приход в бухгалтерии' ~ 'бухгалтерский приход' (server)", () => {
    const existing = [
      { id: 1, text: "бухгалтерский приход", lang: "ru" as const },
    ];
    const prepared = prepareExisting(existing);
    const res = compareWithPrepared(
      { text: "Приход в бухгалтерии", lang: "ru" },
      prepared,
      { topK: 1 },
    );
    expect(res.top[0]?.percent).toBeGreaterThanOrEqual(70);
  });

  it("matches 'Приход в бухгалтерии' ~ 'бухгалтерский приход' (client)", () => {
    const existing = [
      { id: 1, text: "бухгалтерский приход", lang: "ru" as const },
    ];
    const prepared = prepClient(existing);
    const res = compareClient(
      { text: "Приход в бухгалтерии", lang: "ru" },
      prepared,
      { topK: 1 },
    );
    expect(res.top[0]?.percent).toBeGreaterThanOrEqual(70);
  });
});
