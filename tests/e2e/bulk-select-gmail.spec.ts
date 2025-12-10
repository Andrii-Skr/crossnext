import { expect, test } from "@playwright/test";

test("bulk tagging uses select-all-across-filter payload with exclusions", async ({ page }) => {
  let bulkPayload: unknown;

  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "777", role: "ADMIN", email: "e2e@test" },
        expires: new Date(Date.now() + 60_000).toISOString(),
      }),
    }),
  );

  await page.route("**/api/dictionary*", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "w1",
            word_text: "Alpha",
            opred_v: [
              { id: "d1", text_opr: "First", tags: [] },
              { id: "d2", text_opr: "Second", tags: [] },
            ],
          },
        ],
        nextCursor: null,
        total: 1,
        totalDefs: 5,
      }),
    });
  });

  await page.route("**/api/tags", (route) => {
    if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() || "{}");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 501, name: body.name || "bulk-tag" }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.route("**/api/dictionary/bulk-tags", (route) => {
    bulkPayload = JSON.parse(route.request().postData() || "{}");
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ applied: 3 }) });
  });

  await page.goto("/ru");

  await page.getByLabel(/массовое назначение тегов/i).click();
  await page.getByPlaceholder(/теги для применения/i).fill("bulk-tag");
  await page.keyboard.press("Enter");

  await page.getByLabel(/выбрать все/i).click();
  await page.getByRole("button", { name: /выбрать все 5/i }).click();
  await page
    .getByLabel(/выбрать/i)
    .nth(1)
    .click(); // exclude second row

  await page.getByLabel(/применить теги/i).click();

  await expect.poll(() => bulkPayload).not.toBeNull();
  expect(bulkPayload).toMatchObject({
    action: "applyTags",
    selectAllAcrossFilter: true,
    excludeIds: ["d2"],
    tagIds: [501],
    filter: expect.objectContaining({ language: "ru" }),
  });
});
