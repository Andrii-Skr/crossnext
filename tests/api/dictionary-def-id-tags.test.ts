vi.mock("@/auth", () => ({ authOptions: {} as unknown }));

import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "../../app/api/dictionary/def/[id]/tags/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary/def/[id]/tags", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("GET returns tags and difficulty for definition", async () => {
    prisma.opred_v.findUnique.mockResolvedValueOnce({
      difficulty: 2,
      tags: [{ tag: { id: 1, name: "t1" } }, { tag: { id: 2, name: "t2" } }],
    });
    const req = makeReq("GET", "http://localhost/api/dictionary/def/10/tags");
    const res = await GET(req, makeCtx({ id: "10" }));
    const { status, json } = await readJson<{
      items: Array<{ id: number; name: string }>;
      difficulty: number;
    }>(res);
    expect(status).toBe(200);
    expect(json.items).toEqual([
      { id: 1, name: "t1" },
      { id: 2, name: "t2" },
    ]);
    expect(json.difficulty).toBe(2);
  });

  it("POST attaches a tag", async () => {
    prisma.opredTag.createMany.mockResolvedValueOnce({ count: 1 });
    const req = makeReq("POST", "http://localhost/api/dictionary/def/10/tags", {
      tagId: 3,
    });
    const res = await POST(req, makeCtx({ id: "10" }));
    const { status, json } = await readJson<{ ok: boolean }>(res);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.opredTag.createMany).toHaveBeenCalledOnce();
  });

  it("DELETE validates tagId and detaches", async () => {
    // invalid tagId
    let req = makeReq("DELETE", "http://localhost/api/dictionary/def/10/tags?tagId=0");
    let res = await DELETE(req, makeCtx({ id: "10" }));
    const parsed = await readJson<{ error: string }>(res);
    expect(parsed.status).toBe(400);
    expect(parsed.json.error).toBe("Invalid tagId");

    // valid
    prisma.opredTag.deleteMany.mockResolvedValueOnce({ count: 1 });
    req = makeReq("DELETE", "http://localhost/api/dictionary/def/10/tags?tagId=5");
    res = await DELETE(req, makeCtx({ id: "10" }));
    const { status, json } = await readJson<{ ok: boolean }>(res);
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });
});
