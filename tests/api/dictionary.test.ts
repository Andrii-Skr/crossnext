import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { GET } from "../../app/api/dictionary/route";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary (GET)", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1" }); // not required, but consistent
  });

  it("returns paged items with string ids", async () => {
    prisma.word_v.findMany.mockResolvedValueOnce([
      {
        id: BigInt(1),
        word_text: "test",
        opred_v: [
          {
            id: BigInt(11),
            text_opr: "def one",
            tags: [{ tag: { id: 1, name: "tag1" } }, { tag: { id: 2, name: "tag2" } }],
          },
        ],
      },
    ]);
    prisma.word_v.count.mockResolvedValueOnce(1);
    prisma.opred_v.count.mockResolvedValueOnce(1);

    const req = makeReq("GET", "http://localhost/api/dictionary?take=20");
    const res = await GET(req, makeCtx({}));
    const { status, json } = await readJson<{
      items: Array<{
        id: string;
        word_text: string;
        opred_v: Array<{ id: string; text_opr: string }>;
      }>;
      nextCursor: string | null;
      total: number;
      totalDefs: number;
    }>(res);

    expect(status).toBe(200);
    expect(json.items[0].id).toBe("1");
    expect(json.items[0].opred_v[0].id).toBe("11");
    expect(json.total).toBe(1);
    expect(json.totalDefs).toBe(1);
    expect(json.nextCursor).toBe(null);
  });
});
