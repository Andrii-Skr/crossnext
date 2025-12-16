import { expect, test } from "@playwright/test";

test("dictionary: create new word with two definitions and tags", async ({ page }) => {
  const word = `e2e-${Date.now()}`;
  const def1 = "определение первое";
  const def2 = "определение второе";

  await page.goto("/auth/sign-in");
  await page.getByLabel(/login/i).fill(process.env.ADMIN_LOGIN || "admin");
  await page.getByLabel("Password").fill(process.env.ADMIN_PASSWORD || "ChangeMe123!");
  const loginRespPromise = page.waitForResponse(
    (r) => r.url().includes("/api/auth/callback/credentials") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  const loginResp = await loginRespPromise.catch(() => null);
  if (!loginResp || !loginResp.ok()) {
    throw new Error(
      `Sign-in failed: ${(loginResp && `${loginResp.status()} ${loginResp.statusText()}`) || "no response"}`,
    );
  }
  let hasSession = false;
  for (let i = 0; i < 10; i++) {
    const cookies = await page.context().cookies();
    hasSession = cookies.some((c) => c.name.includes("next-auth"));
    if (hasSession) break;
    await page.waitForTimeout(500);
  }
  if (!hasSession) throw new Error("Sign-in failed: no session cookie. Check ADMIN_LOGIN/ADMIN_PASSWORD env for e2e.");

  const dictionaryPaths = ["/ru/dictionary", "/dictionary", "/en/dictionary"];
  let navigated = false;
  for (const path of dictionaryPaths) {
    await page.goto(path, { waitUntil: "networkidle" });
    const notFound = await page
      .getByRole("heading", { name: /not found/i })
      .isVisible({ timeout: 500 })
      .catch(() => false);
    const backToSignIn = await page
      .getByRole("heading", { name: /sign in/i })
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (!notFound && !backToSignIn) {
      navigated = true;
      break;
    }
  }
  if (!navigated) throw new Error(`Dictionary page not found (checked ${dictionaryPaths.join(", ")}).`);

  const newBtn = page.getByRole("button", { name: /новое|new/i, exact: false });
  await newBtn
    .first()
    .click({ trial: true })
    .catch(async () => {
      await page
        .getByRole("button", { name: /новый|add/i, exact: false })
        .first()
        .click();
    });

  await page.getByLabel(/слово/i).fill(word);
  await page
    .getByLabel(/определение/i)
    .first()
    .fill(def1);
  await page
    .getByLabel(/сложность/i)
    .first()
    .click();
  await page.getByRole("option", { name: "2" }).click();
  await page
    .getByLabel(/дата окончания/i)
    .first()
    .click();
  await page.getByRole("option", { name: /6 месяцев/i }).click();
  await page.getByLabel(/теги/i).first().fill("дно");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: /добавить еще определение/i }).click();

  await page
    .getByLabel(/определение/i)
    .last()
    .fill(def2);
  await page
    .getByLabel(/сложность/i)
    .last()
    .click();
  await page.getByRole("option", { name: "2" }).click();
  await page
    .getByLabel(/дата окончания/i)
    .last()
    .click();
  await page.getByRole("option", { name: /6 месяцев/i }).click();
  const secondTagInput = page.getByLabel(/теги/i).last();
  await secondTagInput.fill("общее");
  await page.keyboard.press("Enter");
  await secondTagInput.fill("дно");
  await page.keyboard.press("Enter");

  const respPromise = page.waitForResponse(
    (r) => r.url().includes("/api/pending/create-new") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /создать/i }).click();
  const resp = await respPromise;
  expect(resp.ok()).toBe(true);
  const payload = resp.request().postDataJSON() as {
    word: string;
    definitions: Array<{ definition: string; difficulty?: number; end_date?: string; tags?: number[] }>;
  };
  expect(payload.word).toBe(word.replace(/\s+/g, "").toLowerCase());
  expect(payload.definitions).toHaveLength(2);
  expect(payload.definitions[0].definition).toBe(def1);
  expect(payload.definitions[0].difficulty).toBe(2);
  expect(payload.definitions[0].end_date).toBeTruthy();
  expect(payload.definitions[0].tags?.length).toBeGreaterThanOrEqual(1);
  expect(payload.definitions[1].definition).toBe(def2);
  expect(payload.definitions[1].difficulty).toBe(2);
  expect(payload.definitions[1].end_date).toBeTruthy();
  expect(payload.definitions[1].tags?.length).toBeGreaterThanOrEqual(2);

  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });
});
