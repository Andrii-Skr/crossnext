import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Prisma, Role } from "@prisma/client";
import { compare } from "bcrypt";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  secret: env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: Record<string, unknown> | undefined) {
        const loginRaw =
          (credentials && typeof credentials.login === "string" ? credentials.login : null) ??
          (credentials && typeof credentials.email === "string" ? credentials.email : null);
        const password = credentials && typeof credentials.password === "string" ? credentials.password : null;
        if (!loginRaw || !password) return null;
        const login = String(loginRaw).trim();

        let user: Prisma.UserGetPayload<{ include: { role: true } }> | null = null;
        if (login.includes("@")) {
          // Try exact email match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { email: login }, include: { role: true } });
          if (!user) {
            const list = await prisma.user.findMany({
              where: { email: { contains: login, mode: "insensitive" } },
              take: 5,
              include: { role: true },
            });
            user = list.find((u) => (u.email ?? "").toLowerCase() === login.toLowerCase()) ?? null;
          }
        } else {
          // Try exact login match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { name: login }, include: { role: true } });
          if (!user) {
            const list = await prisma.user.findMany({
              where: { name: { contains: login, mode: "insensitive" } },
              take: 5,
              include: { role: true },
            });
            user = list.find((u) => (u.name ?? "").toLowerCase() === login.toLowerCase()) ?? null;
          }
        }

        if (!user || !user.passwordHash || user.is_deleted) return null;
        const ok = await compare(String(password), user.passwordHash);
        if (!ok) return null;
        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          image: user.image,
          role: (user.role?.code ?? null) as Role | null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Cast via unknown to satisfy strict TS about union narrowing
        const u = user as unknown as Record<string, unknown>;
        const rawId = u.id;
        const rawRole = u.role;
        (token as Record<string, unknown>).id =
          typeof rawId === "string" ? rawId : rawId != null ? String(rawId) : undefined;
        // Store role in the token as a string for portability
        (token as Record<string, unknown>).role =
          typeof rawRole === "string" ? rawRole : rawRole != null ? String(rawRole) : "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session?.user) {
        const t = token as Record<string, unknown>;
        const s = session.user as Record<string, unknown>;
        if (t.id != null) s.id = String(t.id);
        if (typeof t.role === "string") {
          const r = t.role as string;
          s.role = r as Role | string;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};
