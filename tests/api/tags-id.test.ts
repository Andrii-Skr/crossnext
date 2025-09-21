import { beforeEach, describe, expect, it } from "vitest";
import { DELETE, PUT } from "../../app/api/tags/[id]/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makePrismaKnownError, makeReq, readJson } from "./_utils";

describe("/api/tags/[id]", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("PUT updates tag (auth, admin)", async () => {
    setAuthed({ id: "u1", role: "ADMIN" });
    prisma.tag.update.mockResolvedValueOnce({ id: 5, name: "Renamed" });

    const req = makeReq("PUT", "http://localhost/api/tags/5", {
      name: "Renamed",
    });
    const res = await PUT(req, makeCtx({ id: "5" }));
    const { status, json } = await readJson<{ id: number; name: string }>(res);

    expect(status).toBe(200);
    expect(json.name).toBe("Renamed");
    expect(prisma.tag.update).toHaveBeenCalledOnce();
  });

  it("PUT returns 409 on Prisma P2002 (duplicate)", async () => {
    setAuthed({ id: "u1", role: "ADMIN" });
    prisma.tag.update.mockRejectedValueOnce(makePrismaKnownError("P2002"));
    const req = makeReq("PUT", "http://localhost/api/tags/5", { name: "Dup" });
    const res = await PUT(req, makeCtx({ id: "5" }));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(409);
    expect(json.message).toContain("Duplicate entry");
  });

  it("DELETE removes tag (auth, admin)", async () => {
    setAuthed({ id: "u1", role: "ADMIN" });
    prisma.tag.delete.mockResolvedValueOnce({});

    const req = makeReq("DELETE", "http://localhost/api/tags/7");
    const res = await DELETE(req, makeCtx({ id: "7" }));
    const { status, json } = await readJson<{ ok: boolean }>(res);

    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(prisma.tag.delete).toHaveBeenCalledOnce();
  });

  it("DELETE returns 404 on Prisma P2025 (not found)", async () => {
    setAuthed({ id: "u1", role: "ADMIN" });
    prisma.tag.delete.mockRejectedValueOnce(makePrismaKnownError("P2025"));
    const req = makeReq("DELETE", "http://localhost/api/tags/7");
    const res = await DELETE(req, makeCtx({ id: "7" }));
    const { status, json } = await readJson<{
      success: boolean;
      message: string;
    }>(res);
    expect(status).toBe(404);
    expect(json.message).toContain("Record not found");
  });
});
