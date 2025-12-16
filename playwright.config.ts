import { chromium, defineConfig, devices } from "@playwright/test";

const chromiumExecutable = chromium.executablePath();

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      executablePath: chromiumExecutable,
      args: ["--no-sandbox", "--disable-gpu", "--disable-setuid-sandbox"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
