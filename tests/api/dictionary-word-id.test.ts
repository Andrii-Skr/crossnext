vi.mock("@/auth", () => ({ authOptions: {} as unknown }));
import { beforeEach, describe, expect, it } from "vitest";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { PUT } from "../../app/api/dictionary/word/[id]/route";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary/word/[id] (PUT)", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("creates pending rename card and returns pending id", async () => {
    prisma.word_v.findUnique.mockResolvedValueOnce({ id: BigInt(123), langId: 3 });
    prisma.pendingWords.findFirst.mockResolvedValueOnce(null);
    prisma.pendingWords.create.mockResolvedValueOnce({ id: BigInt(55) });
    const req = makeReq("PUT", "http://localhost/api/dictionary/word/123", { word_text: "abc" });
    const res = await PUT(req, makeCtx({ id: "123" }));
    const { status, json } = await readJson<{ success: boolean; id: string }>(res);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.id).toBe("55");
  });

  it("returns 404 if base word not found", async () => {
    prisma.word_v.findUnique.mockResolvedValueOnce(null);
    const req = makeReq("PUT", "http://localhost/api/dictionary/word/1", { word_text: "abc" });
    const res = await PUT(req, makeCtx({ id: "1" }));
    const { status, json } = await readJson<{ success: boolean; message: string }>(res);
    expect(status).toBe(404);
    expect(json.message).toContain("Word not found");
  });
});
