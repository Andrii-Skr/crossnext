import { PendingStatus, Role } from "@prisma/client";
import { hash } from "bcrypt";
import { prisma } from "../lib/db";
import { env } from "../lib/env";

async function seedAdmin() {
  const emailFromEnv = process.env.ADMIN_EMAIL;

  const existingByEmail = emailFromEnv
    ? await prisma.user.findUnique({ where: { email: emailFromEnv } })
    : null;

  const existingByLogin = await prisma.user.findFirst({
    where: { name: env.ADMIN_LOGIN },
  });
  if (existingByEmail || existingByLogin) {
    console.log("Admin user exists");
    return (
      existingByEmail ||
      (existingByLogin as NonNullable<typeof existingByLogin>)
    );
  }

  const passwordHash = await hash(env.ADMIN_PASSWORD, 12);
  const data: Parameters<typeof prisma.user.create>[0]["data"] = {
    name: env.ADMIN_LOGIN,
    passwordHash,
    role: Role.ADMIN,
  };
  if (emailFromEnv) data.email = emailFromEnv;
  const user = await prisma.user.create({ data });
  console.log("Admin user created", {
    login: env.ADMIN_LOGIN,
    email: emailFromEnv,
  });
  return user;
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
  const { ru, en, wordRuId } = await seedDictionary();
  await seedTags();
  await seedPending(ru.id, en.id, wordRuId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
