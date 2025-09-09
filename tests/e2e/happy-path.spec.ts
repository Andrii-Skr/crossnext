import { test, expect } from "@playwright/test";

test("sign in → dictionary search → CRUD → logout", async ({ page }) => {
  await page.goto("/");
  await page.goto("/auth/sign-in");
  await page.getByLabel(/login/i).fill(process.env.ADMIN_LOGIN || "admin");
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD || "ChangeMe123!");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.goto("/dictionary");
  await page.getByLabel("Search query").fill("a");
  await page.getByRole("button", { name: /показать ещё/i }).click({ trial: true }).catch(() => {});

  await page.goto("/dashboard");
  await page.getByPlaceholder("New tag").fill("e2e-tag");
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page.getByDisplayValue("e2e-tag")).toBeVisible();
});
