import { PrismaAdapter } from "@next-auth/prisma-adapter";
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
          (credentials && typeof credentials.login === "string"
            ? credentials.login
            : null) ??
          (credentials && typeof credentials.email === "string"
            ? credentials.email
            : null);
        const password =
          credentials && typeof credentials.password === "string"
            ? credentials.password
            : null;
        if (!loginRaw || !password) return null;
        const login = String(loginRaw).trim();

        let user = null as Awaited<
          ReturnType<typeof prisma.user.findFirst>
        > | null;
        if (login.includes("@")) {
          // Try exact email match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { email: login } });
          if (!user) {
            const list = await prisma.user.findMany({
              where: { email: { contains: login, mode: "insensitive" } },
              take: 5,
            });
            user =
              list.find(
                (u) => (u.email ?? "").toLowerCase() === login.toLowerCase(),
              ) ?? null;
          }
        } else {
          // Try exact login match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { name: login } });
          if (!user) {
            const list = await prisma.user.findMany({
              where: { name: { contains: login, mode: "insensitive" } },
              take: 5,
            });
            user =
              list.find(
                (u) => (u.name ?? "").toLowerCase() === login.toLowerCase(),
              ) ?? null;
          }
        }

        if (!user || !user.passwordHash) return null;
        const ok = await compare(String(password), user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
        } as {
          id: string;
          name: string | null;
          email: string | null;
          image: string | null;
          role: string | null;
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as Record<string, unknown>;
        const id = typeof u.id === "string" ? u.id : undefined;
        const role = typeof u.role === "string" ? u.role : undefined;
        (token as Record<string, unknown>).id = id;
        (token as Record<string, unknown>).role = role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session?.user) {
        const t = token as Record<string, unknown>;
        const s = session.user as Record<string, unknown>;
        if (typeof t.id === "string") s.id = t.id;
        if (typeof t.role === "string") s.role = t.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};
