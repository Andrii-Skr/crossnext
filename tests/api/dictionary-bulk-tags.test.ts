import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../../app/api/dictionary/bulk-tags/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary/bulk-tags (POST)", () => {
  beforeEach(() => {
    resetMocks();
    // Run transactions inline for deterministic assertions
    prisma.$transaction.mockImplementation(async (cb: (arg: typeof prisma) => Promise<unknown>) => cb(prisma as never));
  });

  it("applies tags to explicit ids", async () => {
    setAuthed({ id: "42", role: "ADMIN", email: "admin@test" });
    prisma.opredTag.createMany.mockResolvedValue({ count: 2 });
    prisma.opred_v.updateMany.mockResolvedValue({ count: 2 });

    const req = makeReq("POST", "http://localhost/api/dictionary/bulk-tags", {
      action: "applyTags",
      tagIds: [5],
      ids: ["1", "2"],
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ applied: number }>(res);

    expect(status).toBe(200);
    expect(json.applied).toBe(2);
    expect(prisma.opredTag.createMany).toHaveBeenCalledWith({
      data: [
        { opredId: BigInt(1), tagId: 5, addedBy: "admin@test" },
        { opredId: BigInt(2), tagId: 5, addedBy: "admin@test" },
      ],
      skipDuplicates: true,
    });
    expect(prisma.opred_v.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [BigInt(1), BigInt(2)] } },
      data: { updateBy: 42 },
    });
  });

  it("applies tags across filter with exclusions", async () => {
    setAuthed({ id: "99", role: "ADMIN", email: "bulk@test" });
    prisma.opredTag.createMany.mockResolvedValue({ count: 2 });
    prisma.opred_v.updateMany.mockResolvedValue({ count: 2 });
    prisma.opred_v.findMany
      .mockResolvedValueOnce([{ id: BigInt(10) }, { id: BigInt(11) }, { id: BigInt(12) }])
      .mockResolvedValueOnce([]);

    const req = makeReq("POST", "http://localhost/api/dictionary/bulk-tags", {
      action: "applyTags",
      tagIds: [7],
      selectAllAcrossFilter: true,
      filter: { language: "ru", scope: "both", query: "abc" },
      excludeIds: ["11"],
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ applied: number }>(res);

    expect(status).toBe(200);
    expect(json.applied).toBe(2);
    expect(prisma.opred_v.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.opredTag.createMany).toHaveBeenCalledWith({
      data: [
        { opredId: BigInt(10), tagId: 7, addedBy: "bulk@test" },
        { opredId: BigInt(12), tagId: 7, addedBy: "bulk@test" },
      ],
      skipDuplicates: true,
    });
    expect(prisma.opred_v.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [BigInt(10), BigInt(12)] } },
      data: { updateBy: 99 },
    });
  });

  it("requires auth", async () => {
    setAuthed(null);
    const req = makeReq("POST", "http://localhost/api/dictionary/bulk-tags", {
      action: "applyTags",
      tagIds: [1],
      ids: ["1"],
    });
    const res = await POST(req, makeCtx({}));
    const { status } = await readJson(res);
    expect(status).toBe(401);
    expect(prisma.opredTag.createMany).not.toHaveBeenCalled();
  });
});
