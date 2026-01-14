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

  const [wordRows, opredRows] = await Promise.all([
    prisma.word_v.findMany({
      where: {
        langId,
        is_deleted: false,
        OR: [{ createdAt: { gte: start } }, { updatedAt: { gte: start } }],
      },
      select: {
        id: true,
        word_text: true,
        createdAt: true,
        updatedAt: true,
        createBy: true,
        updateBy: true,
        approvedBy: true,
      },
    }),
    prisma.opred_v.findMany({
      where: {
        langId,
        is_deleted: false,
        word_v: { is_deleted: false },
        OR: [{ createdAt: { gte: start } }, { textUpdatedAt: { gte: start } }],
      },
      select: {
        id: true,
        text_opr: true,
        createdAt: true,
        textUpdatedAt: true,
        createBy: true,
        updateBy: true,
        approvedBy: true,
        word_v: { select: { word_text: true } },
      },
    }),
  ]);

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

  for (const word of wordRows) {
    const createdAt = word.createdAt ?? word.updatedAt ?? null;
    const updatedAt = word.updatedAt ?? null;
    const wordLabel = word.word_text ?? "";

    if (createdAt && createdAt >= start) {
      pushEvent(createdAt, resolveUserId(word.createBy), "wordAdded", {
        id: `word-${String(word.id)}`,
        word: wordLabel,
      });
    }

    if (updatedAt && updatedAt >= start) {
      const isEdited = createdAt ? updatedAt.getTime() > createdAt.getTime() : true;
      if (isEdited) {
        pushEvent(updatedAt, resolveUserId(word.updateBy), "wordEdited", {
          id: `word-edit-${String(word.id)}`,
          word: wordLabel,
        });
      }
    }
  }

  for (const def of opredRows) {
    const createdAt = def.createdAt ?? null;
    const updatedAt = def.textUpdatedAt ?? null;
    const wordLabel = def.word_v?.word_text ?? "";
    const definitionLabel = def.text_opr ?? "";

    if (createdAt && createdAt >= start) {
      pushEvent(createdAt, resolveUserId(def.createBy), "definitionAdded", {
        id: `def-${String(def.id)}`,
        word: wordLabel,
        definition: definitionLabel,
      });
    }

    if (updatedAt && updatedAt >= start) {
      const isEdited = createdAt ? updatedAt.getTime() > createdAt.getTime() : true;
      if (isEdited) {
        pushEvent(updatedAt, resolveUserId(def.updateBy), "definitionEdited", {
          id: `def-edit-${String(def.id)}`,
          word: wordLabel,
          definition: definitionLabel,
        });
      }
    }
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
