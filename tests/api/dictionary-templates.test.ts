vi.mock("@/auth", () => ({ authOptions: {} as unknown }));

import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/dictionary/templates/route";
import { prisma, resetMocks, setAuthed } from "../mocks";
import { makeCtx, makeReq, readJson } from "./_utils";

describe("/api/dictionary/templates (GET)", () => {
  beforeEach(() => {
    resetMocks();
    setAuthed({ id: "u1", role: "ADMIN" });
  });

  it("returns only active templates by default", async () => {
    prisma.dictionaryFilterTemplate.findMany.mockResolvedValueOnce([
      {
        id: 7,
        name: "Active template",
        language: "ru",
        query: "abc",
        scope: "word",
        searchMode: "contains",
        lenFilterField: null,
        lenMin: null,
        lenMax: null,
        difficultyMin: null,
        difficultyMax: null,
        tagNames: [],
        excludeTagNames: [],
        is_deleted: false,
        _count: { issues: 0 },
      },
    ]);

    const res = await GET(makeReq("GET", "http://localhost/api/dictionary/templates?lang=ru"), makeCtx({}));
    const { status, json } = await readJson<{ items: Array<Record<string, unknown>> }>(res);

    expect(status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.name).toBe("Active template");
    expect(json.items[0]).not.toHaveProperty("isDeleted");
    expect(json.items[0]).not.toHaveProperty("usageCount");
    const call = prisma.dictionaryFilterTemplate.findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
    expect(call?.where).toMatchObject({ is_deleted: false, language: "ru" });
  });

  it("forbids includeDeleted for non-admin roles", async () => {
    setAuthed({ id: "u2", role: "USER" });
    const res = await GET(makeReq("GET", "http://localhost/api/dictionary/templates?includeDeleted=1"), makeCtx({}));
    const { status, json } = await readJson<{ errorCode?: string }>(res);

    expect(status).toBe(403);
    expect(json.errorCode).toBe("FORBIDDEN");
    expect(prisma.dictionaryFilterTemplate.findMany).not.toHaveBeenCalled();
  });

  it("returns deleted templates and usageCount for admins when includeDeleted=1", async () => {
    prisma.dictionaryFilterTemplate.findMany.mockResolvedValueOnce([
      {
        id: 9,
        name: "Hidden template",
        language: "ru",
        query: null,
        scope: "both",
        searchMode: "exact",
        lenFilterField: "word",
        lenMin: 3,
        lenMax: 5,
        difficultyMin: 1,
        difficultyMax: 3,
        tagNames: ["a"],
        excludeTagNames: ["b"],
        is_deleted: true,
        _count: { issues: 4 },
      },
    ]);

    const res = await GET(
      makeReq("GET", "http://localhost/api/dictionary/templates?includeDeleted=1&lang=ru"),
      makeCtx({}),
    );
    const { status, json } = await readJson<{ items: Array<Record<string, unknown>> }>(res);

    expect(status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.isDeleted).toBe(true);
    expect(json.items[0]?.usageCount).toBe(4);
    const call = prisma.dictionaryFilterTemplate.findMany.mock.calls[0]?.[0] as { where?: Record<string, unknown> };
    expect(call?.where).toMatchObject({ language: "ru" });
    expect(call?.where).not.toHaveProperty("is_deleted");
  });
});
