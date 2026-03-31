vi.mock("@/auth", () => ({ authOptions: {} as unknown }));

import { beforeEach, describe, expect, it } from "vitest";
import { POST as RESTORE } from "../../app/api/dictionary/templates/[id]/restore/route";
import { DELETE, PUT } from "../../app/api/dictionary/templates/[id]/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary/templates/[id]", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("PUT updates only template name", async () => {
    prisma.dictionaryFilterTemplate.update.mockResolvedValueOnce({ id: 3 });

    const req = makeReq("PUT", "http://localhost/api/dictionary/templates/3", {
      name: "Updated",
    });

    const res = await PUT(req, makeCtx({ id: "3" }));
    const { status, json } = await readJson<{ id: number }>(res);

    expect(status).toBe(200);
    expect(json.id).toBe(3);
    const call = prisma.dictionaryFilterTemplate.update.mock.calls[0]?.[0] as { data?: { name?: string } };
    expect(call?.data).toEqual({ name: "Updated" });
  });

  it("DELETE performs hard delete when there are no issue references", async () => {
    prisma.issue.count.mockResolvedValueOnce(0);
    prisma.dictionaryFilterTemplate.delete.mockResolvedValueOnce({ id: 5 });

    const res = await DELETE(makeReq("DELETE", "http://localhost/api/dictionary/templates/5"), makeCtx({ id: "5" }));
    const { status, json } = await readJson<{ mode: "hard" | "soft" }>(res);

    expect(status).toBe(200);
    expect(json.mode).toBe("hard");
    expect(prisma.dictionaryFilterTemplate.delete).toHaveBeenCalledOnce();
    expect(prisma.dictionaryFilterTemplate.update).not.toHaveBeenCalled();
  });

  it("DELETE performs soft delete when template is used by issues", async () => {
    prisma.issue.count.mockResolvedValueOnce(2);
    prisma.dictionaryFilterTemplate.update.mockResolvedValueOnce({ id: 7 });

    const res = await DELETE(makeReq("DELETE", "http://localhost/api/dictionary/templates/7"), makeCtx({ id: "7" }));
    const { status, json } = await readJson<{ mode: "hard" | "soft"; usageCount?: number }>(res);

    expect(status).toBe(200);
    expect(json.mode).toBe("soft");
    expect(json.usageCount).toBe(2);
    expect(prisma.dictionaryFilterTemplate.update).toHaveBeenCalledOnce();
    expect(prisma.dictionaryFilterTemplate.delete).not.toHaveBeenCalled();
  });

  it("POST restore resets is_deleted for soft-deleted template", async () => {
    prisma.dictionaryFilterTemplate.update.mockResolvedValueOnce({ id: 11 });

    const res = await RESTORE(
      makeReq("POST", "http://localhost/api/dictionary/templates/11/restore", {}),
      makeCtx({ id: "11" }),
    );
    const { status, json } = await readJson<{ id: number; isDeleted: boolean }>(res);

    expect(status).toBe(200);
    expect(json.id).toBe(11);
    expect(json.isDeleted).toBe(false);
    expect(prisma.dictionaryFilterTemplate.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { is_deleted: false },
      select: { id: true },
    });
  });

  it("forbids PUT/DELETE/restore for users without admin access", async () => {
    setAuthed({ id: "u2", role: "USER" });
    const putRes = await PUT(
      makeReq("PUT", "http://localhost/api/dictionary/templates/10", {
        name: "Updated",
      }),
      makeCtx({ id: "10" }),
    );
    const deleteRes = await DELETE(
      makeReq("DELETE", "http://localhost/api/dictionary/templates/10"),
      makeCtx({ id: "10" }),
    );
    const restoreRes = await RESTORE(
      makeReq("POST", "http://localhost/api/dictionary/templates/10/restore", {}),
      makeCtx({ id: "10" }),
    );
    const put = await readJson<{ errorCode?: string }>(putRes);
    const del = await readJson<{ errorCode?: string }>(deleteRes);
    const restore = await readJson<{ errorCode?: string }>(restoreRes);

    expect(put.status).toBe(403);
    expect(del.status).toBe(403);
    expect(restore.status).toBe(403);
    expect(put.json.errorCode).toBe("FORBIDDEN");
    expect(del.json.errorCode).toBe("FORBIDDEN");
    expect(restore.json.errorCode).toBe("FORBIDDEN");
  });
});
