import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Ensure required envs exist in test mode (Vite не подхватывает .env.local в тестах)
process.env.NEXTAUTH_SECRET ||= "test-nextauth-secret";
process.env.NEXTAUTH_URL ||= "http://localhost:3000";

process.env.DATABASE_URL ||= "postgresql://user:pass@localhost:5432/db?schema=public";
// Поднимаем общие моки (next-auth, prisma) до загрузки тестовых модулей
import "./tests/mocks";

// Mock Next.js app router hooks for component tests
vi.mock("next/navigation", () => {
  const push = vi.fn();
  const replace = vi.fn();
  const refresh = vi.fn();
  const back = vi.fn();
  return {
    useRouter: () => ({ push, replace, refresh, back }),
    useSearchParams: () => new URLSearchParams(),
  };
});

// Silence noisy API error logs from apiRoute wrapper for expected error tests (P2002/P2025)
const originalConsoleError = console.error;
// eslint-disable-next-line no-console
console.error = (...args: unknown[]) => {
  const [first] = args;
  if (typeof first === "string" && first.startsWith("API Error:")) return;
  // eslint-disable-next-line prefer-spread
  return originalConsoleError.apply(console, args as [] | [unknown, ...unknown[]]);
};
