import { beforeEach, describe, expect, it } from "vitest";
import { makeReq, makeCtx, readJson } from "./_utils";
import { prisma, resetMocks } from "../mocks";

import { GET } from "../../app/api/pending/count/route";

describe("/api/pending/count (GET)", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("returns aggregated counts", async () => {
    prisma.pendingWords.count.mockResolvedValueOnce(2);
    prisma.pendingDescriptions.count.mockResolvedValueOnce(3);

    const req = makeReq("GET", "http://localhost/api/pending/count");
    const res = await GET(req as any, makeCtx({}));
    const { status, json } = await readJson<{ total: number; words: number; descriptions: number }>(res);
    expect(status).toBe(200);
    expect(json).toEqual({ total: 5, words: 2, descriptions: 3 });
  });
});
