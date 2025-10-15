import { beforeEach, describe, expect, it } from "vitest";
import { PUT } from "../../app/api/dictionary/word/[id]/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makePrismaKnownError, makeReq, readJson } from "./_utils";

describe("/api/dictionary/word/[id] (PUT)", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("updates word text and returns string id", async () => {
    prisma.word_v.update.mockResolvedValueOnce({
      id: BigInt(123),
      word_text: "abc",
    });
    const req = makeReq("PUT", "http://localhost/api/dictionary/word/123", {
      word_text: "abc",
    });
    const res = await PUT(req, makeCtx({ id: "123" }));
    const { status, json } = await readJson<{ id: string; word_text: string }>(res);
    expect(status).toBe(200);
    expect(json.id).toBe("123");
    expect(json.word_text).toBe("abc");
  });

  it("returns 404 on Prisma P2025 (not found)", async () => {
    prisma.word_v.update.mockRejectedValueOnce(makePrismaKnownError("P2025"));
    const req = makeReq("PUT", "http://localhost/api/dictionary/word/1", {
      word_text: "abc",
    });
    const res = await PUT(req, makeCtx({ id: "1" }));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(404);
    expect(json.message).toContain("Record not found");
  });
});
