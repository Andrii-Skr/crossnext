import { beforeEach, describe, expect, it } from "vitest";
import { makeCtx, makeReq, readJson } from "./_utils";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { POST } from "../../app/api/pending/create/route";

describe("/api/pending/create (POST)", () => {
  beforeEach(() => {
    resetMocks();
    prisma.$transaction.mockImplementation(async (cb) => cb(prisma));
  });

  it("requires auth", async () => {
    setAuthed(null);
    const req = makeReq("POST", "http://localhost/api/pending/create", {
      wordId: "1",
      definition: "d",
      language: "ru",
    });
    const res = await POST(req, makeCtx({}));
    const { status } = await readJson(res);
    expect(status).toBe(401);
  });

  it("404 if base word not found", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findUnique.mockResolvedValueOnce(null);
    const req = makeReq("POST", "http://localhost/api/pending/create", {
      wordId: "123",
      definition: "d",
      language: "ru",
    });
    const res = await POST(req, makeCtx({}));
    const { status } = await readJson(res);
    expect(status).toBe(404);
  });

  it("400 if language not found", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findUnique.mockResolvedValueOnce({
      id: BigInt(123),
      word_text: "w",
      length: 1,
    });
    prisma.language.findUnique.mockResolvedValueOnce(null);
    const req = makeReq("POST", "http://localhost/api/pending/create", {
      wordId: "123",
      definition: "d",
      language: "xx",
    });
    const res = await POST(req, makeCtx({}));
    const { status } = await readJson(res);
    expect(status).toBe(400);
  });

  it("creates pending description and returns id", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findUnique.mockResolvedValueOnce({
      id: BigInt(1),
      word_text: "w",
      length: 1,
    });
    prisma.language.findUnique.mockResolvedValueOnce({ id: 9, code: "ru" });
    prisma.pendingWords.create.mockResolvedValueOnce({
      id: BigInt(55),
      descriptions: [{ id: BigInt(99) }],
    });
    const req = makeReq("POST", "http://localhost/api/pending/create", {
      wordId: "1",
      definition: "def",
      language: "ru",
    });
    const res = await POST(req, makeCtx({}));
    const { status, json } = await readJson<{ success: boolean; id: string }>(
      res,
    );
    expect(status).toBe(200);
    expect(json.id).toBe("55");
    expect(prisma.pendingDescriptions.update).not.toHaveBeenCalled();
  });

  it("persists end date when provided", async () => {
    setAuthed({ id: "u1" });
    prisma.word_v.findUnique.mockResolvedValueOnce({
      id: BigInt(1),
      word_text: "w",
      length: 1,
    });
    prisma.language.findUnique.mockResolvedValueOnce({ id: 9, code: "ru" });
    const descriptionId = BigInt(101);
    prisma.pendingWords.create.mockResolvedValueOnce({
      id: BigInt(56),
      descriptions: [{ id: descriptionId }],
    });
    const endDate = "2025-10-01T23:59:59.999Z";
    const req = makeReq("POST", "http://localhost/api/pending/create", {
      wordId: "1",
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
