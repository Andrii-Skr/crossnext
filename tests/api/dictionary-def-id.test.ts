import { beforeEach, describe, expect, it } from "vitest";
import { PUT } from "../../app/api/dictionary/def/[id]/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makePrismaKnownError, makeReq, readJson } from "./_utils";

describe("/api/dictionary/def/[id] (PUT)", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("updates definition and returns string id", async () => {
    prisma.opred_v.update.mockResolvedValueOnce({
      id: BigInt(777),
      text_opr: "def",
    });
    const req = makeReq("PUT", "http://localhost/api/dictionary/def/777", {
      text_opr: "def",
    });
    const res = await PUT(req, makeCtx({ id: "777" }));
    const { status, json } = await readJson<{ id: string; text_opr: string }>(
      res,
    );
    expect(status).toBe(200);
    expect(json.id).toBe("777");
    expect(json.text_opr).toBe("def");
  });

  it("returns 404 on Prisma P2025 (not found)", async () => {
    prisma.opred_v.update.mockRejectedValueOnce(makePrismaKnownError("P2025"));
    const req = makeReq("PUT", "http://localhost/api/dictionary/def/1", {
      text_opr: "def",
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
