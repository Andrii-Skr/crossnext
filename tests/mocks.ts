import { vi } from "vitest";

// next-auth
export const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession }));
getServerSession.mockResolvedValue(null);

// Avoid pulling real auth providers/env from the app
vi.mock("@/auth", () => ({ authOptions: {} as unknown }));

// Prisma client mock — extend per test as needed
export const prisma = {
  $transaction: vi.fn(),
  tag: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pendingWords: {
    count: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  pendingDescriptions: {
    count: vi.fn(),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  word_v: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  opred_v: {
    count: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
  },
  opredTag: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  language: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/db", () => ({ prisma }));

export function setAuthed(user: { id?: string; role?: string } | null) {
  const payload = user
    ? ({
        role: "ADMIN",
        ...user,
      } as unknown)
    : null;
  getServerSession.mockResolvedValue(payload ? ({ user: payload } as unknown) : null);
}

export function resetMocks() {
  getServerSession.mockReset();
  // default to authed admin unless tests override
  setAuthed({ id: "u-test" });
  for (const k of Object.keys(prisma) as (keyof typeof prisma)[]) {
    const entry = prisma[k] as Record<string, unknown> & {
      mockReset?: () => void;
    };
    if (typeof entry?.mockReset === "function") {
      entry.mockReset();
      continue;
    }
    for (const m of Object.keys(entry)) {
      const candidate = entry[m] as { mockReset?: () => void };
      if (typeof candidate?.mockReset === "function") {
        candidate.mockReset();
      }
    }
  }
}
