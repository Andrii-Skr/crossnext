import { vi } from "vitest";

// next-auth
export const getServerSession = vi.fn();
vi.mock("next-auth", () => ({
  getServerSession,
}));

// Avoid pulling real auth providers/env from the app
vi.mock("@/auth", () => ({ authOptions: {} as any }));

// Prisma client mock — extend per test as needed
export const prisma = {
  tag: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  pendingWords: {
    count: vi.fn(),
    create: vi.fn(),
  },
  pendingDescriptions: {
    count: vi.fn(),
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
  getServerSession.mockResolvedValue(user ? ({ user } as any) : null);
}

export function resetMocks() {
  getServerSession.mockReset();
  for (const k of Object.keys(prisma) as (keyof typeof prisma)[]) {
    const group = prisma[k] as Record<string, any>;
    for (const m of Object.keys(group)) {
      if (typeof group[m]?.mockReset === "function") group[m].mockReset();
    }
  }
}
