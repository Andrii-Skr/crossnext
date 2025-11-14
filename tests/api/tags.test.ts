import { beforeEach, describe, expect, it } from "vitest";
// Route under test
import { prisma, resetMocks, setAuthed } from "../mocks";
import { GET, POST } from "../../app/api/tags/route";
import { makeCtx, makePrismaKnownError, makeReq, readJson } from "./_utils";

describe("/api/tags", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("GET returns filtered tags", async () => {
    prisma.tag.findMany.mockResolvedValueOnce([
      { id: 1, name: "Alpha" },
      { id: 2, name: "Beta" },
    ]);

    const req = makeReq("GET", "http://localhost/api/tags?q=al");
    const res = await GET(req, makeCtx({}));
    const { status, json } = await readJson<{
      items: Array<{ id: number; name: string }>;
    }>(res);

    expect(status).toBe(200);
    expect(prisma.tag.findMany).toHaveBeenCalledOnce();
    expect(json.items).toHaveLength(2);
    expect(json.items[0].name).toBe("Alpha");
  });

  it("POST requires auth", async () => {
    setAuthed(null);
    const req = makeReq("POST", "http://localhost/api/tags", { name: "X" });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(401);
    expect(json.message).toBe("Unauthorized");
  });

  it("POST validates body and creates tag", async () => {
    setAuthed({ id: "u1" });
    prisma.tag.create.mockResolvedValueOnce({ id: 10, name: "New" });

    const req = makeReq("POST", "http://localhost/api/tags", { name: "New" });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ id: number; name: string }>(res);

    expect(status).toBe(200);
    expect(json.name).toBe("New");
    expect(prisma.tag.create).toHaveBeenCalledOnce();
  });

  it("POST returns 400 on validation error", async () => {
    setAuthed({ id: "u1" });
    const req = makeReq("POST", "http://localhost/api/tags", { name: "" });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(400);
    expect(json.message).toBe("Validation error");
  });

  it("POST returns 409 on Prisma P2002 (duplicate)", async () => {
    setAuthed({ id: "u1" });
    prisma.tag.create.mockRejectedValueOnce(makePrismaKnownError("P2002"));

    const req = makeReq("POST", "http://localhost/api/tags", { name: "Dup" });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(409);
    expect(json.message).toContain("Duplicate entry");
  });
});
