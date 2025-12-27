import { prisma } from "@/lib/prisma";

type StatsCounts = {
  addedWords: number;
  editedWords: number;
  addedDefinitions: number;
  editedDefinitions: number;
};

export type AdminStatsItemType = "wordAdded" | "wordEdited" | "definitionAdded" | "definitionEdited";

export type AdminStatsItem = {
  id: string;
  type: AdminStatsItemType;
  word: string;
  definition?: string | null;
  approvedAtIso: string;
};

export type AdminStatsUser = {
  userId: string | null;
  userLabel: string | null;
  counts: StatsCounts;
  items: AdminStatsItem[];
};

export type AdminStatsMonth = {
  monthKey: string;
  monthStartIso: string;
  counts: StatsCounts;
  users: AdminStatsUser[];
};

const EMPTY_COUNTS = (): StatsCounts => ({
  addedWords: 0,
  editedWords: 0,
  addedDefinitions: 0,
  editedDefinitions: 0,
});

const getMonthKey = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};

const getMonthStartIso = (key: string) => {
  const [y, m] = key.split("-").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return new Date(0).toISOString();
  return new Date(Date.UTC(y, m - 1, 1)).toISOString();
};

const parseKind = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { kind?: unknown };
    return typeof parsed?.kind === "string" ? parsed.kind : null;
  } catch {
    return null;
  }
};

const resolveUserId = (...values: Array<number | null | undefined>): number | null => {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

export async function getAdminStats({
  langId,
  monthsBack = 12,
  now = new Date(),
}: {
  langId?: number | null;
  monthsBack?: number;
  now?: Date;
}): Promise<AdminStatsMonth[]> {
  if (!langId || !Number.isFinite(langId)) return [];

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1));

  const [wordPendings, descPendings] = await Promise.all([
    prisma.pendingWords.findMany({
      where: {
        status: "APPROVED",
        langId,
        updatedAt: { gte: start },
      },
      select: {
        id: true,
        word_text: true,
        note: true,
        updatedAt: true,
        createBy: true,
        approvedBy: true,
        targetWordId: true,
      },
    }),
    prisma.pendingDescriptions.findMany({
      where: {
        status: "APPROVED",
        langId,
        updatedAt: { gte: start },
      },
      select: {
        id: true,
        description: true,
        note: true,
        updatedAt: true,
        createBy: true,
        approvedBy: true,
        approvedOpredId: true,
        pendingWord: {
          select: {
            id: true,
            word_text: true,
            targetWordId: true,
            note: true,
            createBy: true,
            approvedBy: true,
          },
        },
      },
    }),
  ]);

  const wordIds = new Set<bigint>();
  for (const pw of wordPendings) {
    if (pw.targetWordId) wordIds.add(pw.targetWordId);
  }
  for (const d of descPendings) {
    const wId = d.pendingWord?.targetWordId;
    if (wId) wordIds.add(wId);
  }

  const opredIds = new Set<bigint>();
  for (const d of descPendings) {
    if (d.approvedOpredId) opredIds.add(d.approvedOpredId);
  }

  const [wordRows, opredRows] = await Promise.all([
    wordIds.size
      ? prisma.word_v.findMany({
          where: { id: { in: Array.from(wordIds) } },
          select: { id: true, word_text: true, is_deleted: true },
        })
      : Promise.resolve([]),
    opredIds.size
      ? prisma.opred_v.findMany({
          where: { id: { in: Array.from(opredIds) } },
          select: {
            id: true,
            text_opr: true,
            is_deleted: true,
            langId: true,
            word_v: { select: { id: true, word_text: true, is_deleted: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const wordMap = new Map<string, (typeof wordRows)[number]>(wordRows.map((w) => [String(w.id), w]));
  const opredMap = new Map<string, (typeof opredRows)[number]>(opredRows.map((o) => [String(o.id), o]));

  const monthMap = new Map<
    string,
    {
      monthStartIso: string;
      counts: StatsCounts;
      users: Map<
        string,
        {
          userId: number | null;
          counts: StatsCounts;
          items: AdminStatsItem[];
        }
      >;
    }
  >();
  const userIds = new Set<number>();

  const increment = (counts: StatsCounts, type: AdminStatsItemType) => {
    switch (type) {
      case "wordAdded":
        counts.addedWords += 1;
        break;
      case "wordEdited":
        counts.editedWords += 1;
        break;
      case "definitionAdded":
        counts.addedDefinitions += 1;
        break;
      case "definitionEdited":
        counts.editedDefinitions += 1;
        break;
    }
  };

  const pushEvent = (
    date: Date,
    userId: number | null,
    type: AdminStatsItemType,
    payload: Omit<AdminStatsItem, "approvedAtIso" | "type">,
  ) => {
    const monthKey = getMonthKey(date);
    const month =
      monthMap.get(monthKey) ??
      (() => {
        const created = {
          monthStartIso: getMonthStartIso(monthKey),
          counts: EMPTY_COUNTS(),
          users: new Map<
            string,
            {
              userId: number | null;
              counts: StatsCounts;
              items: AdminStatsItem[];
            }
          >(),
        };
        monthMap.set(monthKey, created);
        return created;
      })();

    const userKey = userId != null ? String(userId) : "unknown";
    const user =
      month.users.get(userKey) ??
      (() => {
        const created = {
          userId,
          counts: EMPTY_COUNTS(),
          items: [] as AdminStatsItem[],
        };
        month.users.set(userKey, created);
        return created;
      })();

    const item: AdminStatsItem = {
      ...payload,
      type,
      approvedAtIso: date.toISOString(),
    };
    user.items.push(item);
    increment(user.counts, type);
    increment(month.counts, type);
    if (userId != null) userIds.add(userId);
  };

  for (const pw of wordPendings) {
    const kind = parseKind(pw.note);
    if (kind !== "newWord" && kind !== "editWord") continue;
    const wordId = pw.targetWordId;
    const word = wordId ? wordMap.get(String(wordId)) : null;
    if (!word || word.is_deleted) continue;
    const baseDate = new Date(pw.updatedAt);
    const userId = resolveUserId(pw.createBy, pw.approvedBy);

    if (kind === "newWord") {
      pushEvent(baseDate, userId, "wordAdded", {
        id: `word-${String(pw.id)}`,
        word: word.word_text || pw.word_text,
      });
    } else if (kind === "editWord") {
      const matches = word.word_text.toLowerCase() === (pw.word_text ?? "").toLowerCase();
      if (!matches) continue;
      pushEvent(baseDate, userId, "wordEdited", {
        id: `word-${String(pw.id)}`,
        word: word.word_text,
      });
    }
  }

  for (const d of descPendings) {
    const opredId = d.approvedOpredId;
    if (!opredId) continue;
    const opred = opredMap.get(String(opredId));
    if (!opred || opred.is_deleted || opred.langId !== langId) continue;
    if (!opred.word_v || opred.word_v.is_deleted) continue;

    const userId = resolveUserId(d.createBy, d.approvedBy, d.pendingWord?.createBy, d.pendingWord?.approvedBy);
    const kind = parseKind(d.note) ?? parseKind(d.pendingWord?.note);
    const type: AdminStatsItemType = kind === "editDef" ? "definitionEdited" : "definitionAdded";
    const matchesCurrent = (opred.text_opr ?? "").trim() === (d.description ?? "").trim();
    if (type === "definitionEdited" && !matchesCurrent) continue;

    pushEvent(new Date(d.updatedAt), userId, type, {
      id: `def-${String(d.id)}`,
      word: opred.word_v.word_text,
      definition: opred.text_opr ?? d.description ?? "",
    });
  }

  const userRows = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map<number, { id: number; name: string | null; email: string | null }>(
    userRows.map((u) => [u.id, u]),
  );

  return Array.from(monthMap.entries())
    .map(([monthKey, value]) => {
      const users: AdminStatsUser[] = Array.from(value.users.values())
        .map((u) => {
          const record = u.userId != null ? (userMap.get(u.userId) ?? null) : null;
          const label = (record?.name ?? null) || (record?.email ?? null) || (u.userId != null ? `#${u.userId}` : null);
          const items = [...u.items].sort((a, b) => b.approvedAtIso.localeCompare(a.approvedAtIso));
          return {
            userId: u.userId != null ? String(u.userId) : null,
            userLabel: label,
            counts: u.counts,
            items,
          };
        })
        .sort((a, b) => {
          const totalA =
            a.counts.addedWords + a.counts.editedWords + a.counts.addedDefinitions + a.counts.editedDefinitions;
          const totalB =
            b.counts.addedWords + b.counts.editedWords + b.counts.addedDefinitions + b.counts.editedDefinitions;
          if (totalA !== totalB) return totalB - totalA;
          return (a.userLabel ?? "").localeCompare(b.userLabel ?? "");
        });

      return {
        monthKey,
        monthStartIso: value.monthStartIso,
        counts: value.counts,
        users,
      };
    })
    .sort((a, b) => b.monthStartIso.localeCompare(a.monthStartIso));
}
