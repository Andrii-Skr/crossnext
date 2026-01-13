CrossNext – Modern Next.js app scaffold with NextAuth, Prisma, Tailwind, shadcn/ui, TanStack Query, RHF+Zod, next-intl, Biome, Vitest and Playwright.

Quickstart

- Install deps:
  - pnpm: corepack enable && pnpm i
  - set up DB: docker compose up -d db
  - migrate: pnpm prisma migrate dev
  - generate client: pnpm prisma generate
  - seed admin: pnpm ts-node prisma/seed.ts or pnpm exec tsx prisma/seed.ts
- Run dev: pnpm dev
- Build: pnpm build && pnpm start

ENV

- Copy .env.example to .env and adjust values.
- Required (runtime): DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL.
- Required (seeding only): ADMIN_LOGIN, ADMIN_PASSWORD.
- Optional: ADMIN_EMAIL (used to set email for the seeded admin user).

Migrations & Seeding

- Create DB (Docker): docker compose up -d db
- Apply migrations: pnpm prisma migrate dev
- Seed admin: pnpm ts-node prisma/seed.ts

Testing

- Unit: pnpm test
- E2E: start the app then pnpm test:e2e

Scripts

- Lint: pnpm lint / pnpm lint:fix
- Format: pnpm format / pnpm format:fix

Notes

- RBAC enforced in API routes using NextAuth session role.
- Credentials auth uses bcrypt with cost 12.
- Security headers set in next.config.ts (CSP, HSTS, Referrer-Policy).

Docs

- User guide (RU): docs/user-guide.md
- AI providers: docs/ai-providers.md
- Legacy sync: docs/legacy-sync.md
