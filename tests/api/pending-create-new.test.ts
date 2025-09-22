import { beforeEach, describe, expect, it } from "vitest";
import { makeCtx, makeReq, readJson } from "./_utils";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { POST } from "../../app/api/pending/create-new/route";

describe("/api/pending/create-new (POST)", () => {
  beforeEach(() => {
    resetMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  it("requires auth", async () => {
    setAuthed(null);
    const req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "abc",
      definition: "d",
      language: "ru",
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(401);
    expect(json.message).toBe("Unauthorized");
  });

  it("validates empty/invalid word and uniqueness", async () => {
    setAuthed({ id: "u1" });
    // Empty after normalization
    let req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "   ",
      definition: "d",
      language: "ru",
    });
    let res = await POST(req, makeCtx({}));
    let parsed = await readJson<{ success: boolean; message: string }>(res);
    expect(parsed.status).toBe(400);
    expect(parsed.json.message).toBe("Empty word");

    // Non-letters
    req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "abc123",
      definition: "d",
      language: "ru",
    });
    res = await POST(req, makeCtx({}));
    parsed = await readJson(res);
    expect(parsed.status).toBe(400);

    // Duplicate
    prisma.word_v.findFirst.mockResolvedValueOnce({ id: BigInt(1) });
    req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "abc",
      definition: "d",
      language: "ru",
    });
    res = await POST(req, makeCtx({}));
    parsed = await readJson(res);
    expect(parsed.status).toBe(409);
  });

  it("returns 400 if language not found", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findFirst.mockResolvedValueOnce(null);
    prisma.language.findUnique.mockResolvedValueOnce(null);

    const req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "abc",
      definition: "d",
      language: "xx",
    });
    const res = await POST(req, makeCtx({}));
    const { status } = await readJson(res);
    expect(status).toBe(400);
  });

  it("creates pending word and returns id", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findFirst.mockResolvedValueOnce(null);
    prisma.language.findUnique.mockResolvedValueOnce({ id: 9, code: "ru" });
    prisma.pendingWords.create.mockResolvedValueOnce({
      id: BigInt(42),
      descriptions: [{ id: BigInt(77) }],
    });

    const req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "Абс",
      definition: "def",
      language: "ru",
      tags: [1, 2],
      note: "n",
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ success: boolean; id: string }>(
      res,
    );
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.id).toBe("42");
    expect(prisma.pendingDescriptions.update).not.toHaveBeenCalled();
  });

  it("stores end date when provided", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findFirst.mockResolvedValueOnce(null);
    prisma.language.findUnique.mockResolvedValueOnce({ id: 9, code: "ru" });
    const descriptionId = BigInt(88);
    prisma.pendingWords.create.mockResolvedValueOnce({
      id: BigInt(43),
      descriptions: [{ id: descriptionId }],
    });

    const endDate = "2025-10-01T23:59:59.999Z";
    const req = makeReq("POST", "http://localhost/api/pending/create-new", {
      word: "Абс",
      definition: "def",
      language: "ru",
      end_date: endDate,
    });
    await POST(req, makeCtx({}));

    expect(prisma.pendingDescriptions.update).toHaveBeenCalledWith({
      where: { id: descriptionId },
      data: { end_date: new Date(endDate) },
    });
  });
});
