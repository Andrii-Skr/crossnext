import { type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { compare } from "bcrypt";

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
      async authorize(credentials) {
        const loginRaw = (credentials as any)?.login ?? (credentials as any)?.email;
        const password = (credentials as any)?.password;
        if (!loginRaw || !password) return null;
        const login = String(loginRaw).trim();

        let user = null as Awaited<ReturnType<typeof prisma.user.findFirst>> | null;
        if (login.includes("@")) {
          // Try exact email match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { email: login } });
          if (!user) {
            const list = await prisma.user.findMany({ where: { email: { contains: login, mode: "insensitive" } }, take: 5 });
            user = list.find((u) => (u.email ?? "").toLowerCase() === login.toLowerCase()) ?? null;
          }
        } else {
          // Try exact login match, then case-insensitive fallback
          user = await prisma.user.findFirst({ where: { name: login } });
          if (!user) {
            const list = await prisma.user.findMany({ where: { name: { contains: login, mode: "insensitive" } }, take: 5 });
            user = list.find((u) => (u.name ?? "").toLowerCase() === login.toLowerCase()) ?? null;
          }
        }

        if (!user || !user.passwordHash) return null;
        const ok = await compare(String(password), user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role ?? "USER";
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        (session as any).user.id = token.id as string;
        (session as any).user.role = (token as any).role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/sign-in",
  },
};
