import fs from "node:fs";
import path from "node:path";
import { PendingStatus, Role } from "@prisma/client";
import { hash } from "bcrypt";
import { z } from "zod";
import { prisma } from "../lib/db";

// ADMIN_* требуем только во время сидирования
const seedEnvSchema = z.object({
  ADMIN_LOGIN: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(8),
  ADMIN_EMAIL: z.string().email().optional(),
});

// Try to populate ADMIN_PASSWORD from secret files if not provided via env
(() => {
  if (process.env.ADMIN_PASSWORD?.trim()) return;
  const candidates = [
    process.env.ADMIN_PASSWORD_FILE,
    "/run/secrets/admin_password",
    path.join(process.cwd(), "secrets/admin_password"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const val = fs.readFileSync(p, "utf8").trim();
        if (val) {
          process.env.ADMIN_PASSWORD = val;
          break;
        }
      }
    } catch {
      // ignore
    }
  }
})();

const seedEnv = seedEnvSchema.parse({
  ADMIN_LOGIN: process.env.ADMIN_LOGIN,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
});

async function ensureRole(code: Role) {
  const row = await prisma.roleDb.upsert({
    where: { code },
    update: {},
    create: { code },
  });
  return row.id;
}

async function seedAdmin() {
  const emailFromEnv = seedEnv.ADMIN_EMAIL;

  const existingByEmail = emailFromEnv ? await prisma.user.findUnique({ where: { email: emailFromEnv } }) : null;

  const existingByLogin = await prisma.user.findFirst({
    where: { name: seedEnv.ADMIN_LOGIN },
  });
  if (existingByEmail || existingByLogin) {
    console.log("Admin user exists");
    return existingByEmail || (existingByLogin as NonNullable<typeof existingByLogin>);
  }

  const passwordHash = await hash(seedEnv.ADMIN_PASSWORD, 12);
  const adminRoleId = await ensureRole(Role.ADMIN);
  const data: Parameters<typeof prisma.user.create>[0]["data"] = {
    name: seedEnv.ADMIN_LOGIN,
    passwordHash,
    role: {
      connect: { id: adminRoleId },
    },
  };
  if (emailFromEnv) data.email = emailFromEnv;
  const user = await prisma.user.create({ data });
  console.log("Admin user created", {
    login: seedEnv.ADMIN_LOGIN,
    email: emailFromEnv,
  });
  return user;
}

async function seedPermissions() {
  // Ensure permissions exist and descriptions are up to date
  const defs = [
    { code: "admin:access", description: "Allow access to admin UI" },
    { code: "pending:review", description: "Review and moderate pending items" },
    { code: "dictionary:write", description: "Create, update, delete words and definitions" },
    { code: "tags:admin", description: "Access tag management in admin UI" },
    { code: "tags:write", description: "Create, update, delete tags" },
  ] as const;

  const codeToId = new Map<string, number>();
  for (const d of defs) {
    const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
      'INSERT INTO "permissions" (code, description) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description RETURNING id',
      d.code,
      d.description,
    );
    const id = rows?.[0]?.id;
    if (typeof id === "number") codeToId.set(d.code, id);
  }

  // Assign permissions to roles
  const assign = async (role: Role, codes: string[]) => {
    const roleId = await ensureRole(role);
    for (const c of codes) {
      const pid = codeToId.get(c);
      if (!pid) continue;
      await prisma.$executeRawUnsafe(
        'INSERT INTO "role_permissions" ("roleId", "permissionId") VALUES ($1, $2) ON CONFLICT ("roleId", "permissionId") DO NOTHING',
        roleId,
        pid,
      );
    }
  };

  await assign(Role.ADMIN, ["admin:access", "pending:review", "dictionary:write", "tags:admin", "tags:write"]);
  await assign("CHIEF_EDITOR_PLUS" as Role, [
    "admin:access",
    "pending:review",
    "dictionary:write",
    "tags:admin",
    "tags:write",
  ]);
  await assign("CHIEF_EDITOR" as Role, [
    "admin:access",
    "pending:review",
    "dictionary:write",
    "tags:admin",
    "tags:write",
  ]);
  await assign("EDITOR" as Role, ["dictionary:write", "tags:write"]);
  await assign(Role.MANAGER, ["pending:review"]);
  await assign(Role.USER, []);

  console.log("Seeded permissions and role mappings");
}

async function upsertLanguage(code: string, name: string) {
  const existing = await prisma.language.findUnique({ where: { code } });
  if (existing) return existing;
  const created = await prisma.language.create({
    data: { code, name, updatedAt: new Date() },
  });
  return created;
}

async function getOrCreateWord(word_text: string, langId: number) {
  const existing = await prisma.word_v.findFirst({
    where: { langId, word_text },
  });
  if (existing) return { id: existing.id };
  return prisma.word_v.create({
    data: { word_text, length: word_text.length, korny: "", langId },
    select: { id: true },
  });
}

async function ensureOpred(word_id: bigint, text_opr: string, langId: number) {
  const existing = await prisma.opred_v.findFirst({
    where: { word_id, text_opr, langId },
  });
  if (existing) return existing;
  return prisma.opred_v.create({
    data: { word_id, text_opr, length: text_opr.length, langId },
  });
}

async function seedDictionary() {
  const ru = await upsertLanguage("ru", "Русский");
  const en = await upsertLanguage("en", "English");

  const wordRu = await getOrCreateWord("пример", ru.id);
  await ensureOpred(wordRu.id, "образец, пример", ru.id);
  await ensureOpred(wordRu.id, "пример использования", ru.id);

  const wordEn = await getOrCreateWord("example", en.id);
  await ensureOpred(wordEn.id, "an instance illustrating a rule", en.id);

  return { ru, en, wordRuId: wordRu.id, wordEnId: wordEn.id };
}

async function seedTags() {
  const names = ["общие", "пример", "важное", "grammar", "usage"];
  for (const name of names) {
    const exists = await prisma.tag.findFirst({ where: { name } });
    if (!exists) {
      await prisma.tag.create({ data: { name } });
    }
  }
  console.log("Seeded tags:", names);
}

async function seedPending(ruId: number, enId: number, existingWordId: bigint) {
  // Pending new word (no targetWordId)
  const alreadyP1 = await prisma.pendingWords.findFirst({
    where: { note: "seed: новая запись" },
  });
  const p1 = alreadyP1
    ? { id: alreadyP1.id }
    : await prisma.pendingWords.create({
        data: {
          word_text: "новинка",
          length: "новинка".length,
          langId: ruId,
          note: "seed: новая запись",
          descriptions: {
            create: [
              { description: "что-то новое", note: "кратко" },
              { description: "новое понятие", note: "дополнение" },
            ],
          },
        },
        select: { id: true },
      });

  // Pending to existing word
  const alreadyP2 = await prisma.pendingWords.findFirst({
    where: { note: "seed: к существующему слову" },
  });
  const p2 = alreadyP2
    ? { id: alreadyP2.id }
    : await prisma.pendingWords.create({
        data: {
          word_text: "пример",
          length: "пример".length,
          langId: ruId,
          note: "seed: к существующему слову",
          targetWordId: existingWordId,
          descriptions: {
            create: [{ description: "ещё одно определение", note: "seed" }],
          },
        },
        select: { id: true },
      });

  // Another pending in English
  const alreadyP3 = await prisma.pendingWords.findFirst({
    where: { note: "seed: english pending" },
  });
  const p3 = alreadyP3
    ? { id: alreadyP3.id }
    : await prisma.pendingWords.create({
        data: {
          word_text: "proposal",
          length: "proposal".length,
          langId: enId,
          note: "seed: english pending",
          descriptions: {
            create: [{ description: "a suggested plan or idea", note: "seed" }],
          },
        },
        select: { id: true },
      });

  // One rejected example
  const alreadyRejected = await prisma.pendingWords.findFirst({
    where: { note: "seed: rejected sample" },
  });
  if (!alreadyRejected) {
    await prisma.pendingWords.create({
      data: {
        word_text: "отклонённое",
        length: "отклонённое".length,
        langId: ruId,
        note: "seed: rejected sample",
        status: PendingStatus.REJECTED,
        descriptions: {
          create: [{ description: "будет отклонено", note: "seed" }],
        },
      },
    });
  }

  console.log("Seeded pending words:", { p1: p1.id, p2: p2.id, p3: p3.id });
}

async function main() {
  await seedAdmin();
  await seedPermissions();
  const { ru, en, wordRuId } = await seedDictionary();
  await seedTags();
  await seedPending(ru.id, en.id, wordRuId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
