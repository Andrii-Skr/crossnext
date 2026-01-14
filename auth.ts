import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { Prisma, Role } from "@prisma/client";
import { compare } from "bcrypt";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    // Делаем сессию долгоживущей, а быструю ревокацию оставляем через middleware + /api/auth/status
    maxAge: 60 * 60 * 24 * 1, // 1 дней
    updateAge: 60 * 60 * 8, // обновляем токен примерно раз в 8 часов активности
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 1, // синхронизируем с session.maxAge
  },
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

        const loadUnique = async (field: "email" | "name") => {
          const list = await prisma.user.findMany({
            where: { [field]: { equals: login, mode: "insensitive" } },
            take: 2,
            include: { role: true },
          });
          if (list.length !== 1) return null;
          return list[0];
        };

        let user: Prisma.UserGetPayload<{ include: { role: true } }> | null = null;
        if (login.includes("@")) {
          user = await loadUnique("email");
        } else {
          user = await loadUnique("name");
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
      const t = token as Record<string, unknown>;
      if (user) {
        // Новая сессия: кладём id/роль в токен
        const u = user as unknown as Record<string, unknown>;
        const rawId = u.id;
        const rawRole = u.role;
        t.id = typeof rawId === "string" ? rawId : rawId != null ? String(rawId) : undefined;
        t.role = typeof rawRole === "string" ? rawRole : rawRole != null ? String(rawRole) : "USER";
        t.isDeleted = false;
        return token;
      }

      const idRaw = t.id;
      const idStr = typeof idRaw === "string" ? idRaw : idRaw != null ? String(idRaw) : null;
      if (!idStr) return token;

      const userId = Number(idStr);
      if (!Number.isFinite(userId)) return token;

      try {
        const fresh = await prisma.user.findUnique({
          where: { id: userId },
          select: { is_deleted: true, role: { select: { code: true } } },
        });
        if (!fresh || fresh.is_deleted) {
          t.role = undefined;
          t.isDeleted = true;
          return token;
        }
        t.role = fresh.role?.code ?? "USER";
        t.isDeleted = false;
        return token;
      } catch {
        // Если не удалось обновить роль — не обнуляем токен, чтобы не разлогинить из-за временной ошибки
        return token;
      }
    },
    async session({ session, token }) {
      const t = token as Record<string, unknown>;
      const isDeleted = Boolean(t.isDeleted);
      const s = session as unknown as Record<string, unknown>;
      if (isDeleted) {
        // Обнуляем пользователя, чтобы доступы на сервере падали по отсутствию роли
        s.user = undefined;
        s.isDeleted = true;
        return session;
      }

      if (session?.user) {
        const su = session.user as unknown as Record<string, unknown>;
        if (t.id != null) su.id = String(t.id);
        if (typeof t.role === "string") su.role = t.role as Role | string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};
