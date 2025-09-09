import { prisma } from "../lib/db";
import { env } from "../lib/env";
import { hash } from "bcrypt";
import { Role } from "@prisma/client";

async function main() {
  // Try find by name (login), then by email if provided in environment
  const existingByLogin = await prisma.user.findFirst({ where: { name: env.ADMIN_LOGIN } });
  if (existingByLogin) {
    console.log("Admin user exists (by login)");
    return;
  }
  const emailFromEnv = process.env.ADMIN_EMAIL;
  if (emailFromEnv) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: emailFromEnv } });
    if (existingByEmail) {
      console.log("Admin user exists (by email)");
      return;
    }
  }
  const passwordHash = await hash(env.ADMIN_PASSWORD, 12);
  const data: Parameters<typeof prisma.user.create>[0]["data"] = {
    name: env.ADMIN_LOGIN,
    passwordHash,
    role: Role.ADMIN,
  };
  if (emailFromEnv) data.email = emailFromEnv;
  await prisma.user.create({ data });
  console.log("Admin user created", { login: env.ADMIN_LOGIN, email: emailFromEnv });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
