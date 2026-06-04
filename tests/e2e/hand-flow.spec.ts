import { expect, test } from "@playwright/test";

test("records a portrait mobile hand with undo and one-hand export", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByText("Live Poker Recorder")).toBeVisible();
  await expect(page.locator("main")).toHaveCSS("max-width", "480px");

  await page.getByRole("button", { name: "Record hand" }).click();
  await expect(page.getByText("Seat 4 to act")).toBeVisible();

  await page.getByRole("button", { name: "Call" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Seat 4 to act")).toBeVisible();
  await page.getByRole("button", { name: "Call" }).click();

  await page.getByRole("button", { name: "Fold" }).click();
  await page.getByRole("button", { name: "Fold" }).click();
  await page.getByRole("button", { name: "Fold" }).click();
  await page.getByRole("button", { name: "Call" }).click();
  await page.getByRole("button", { name: "Check" }).click();

  await page.getByPlaceholder("As 7d 2c").fill("As 7d 2c");
  await page.getByRole("button", { name: "Deal" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();

  await page.getByPlaceholder("Jh").fill("Jh");
  await page.getByRole("button", { name: "Deal" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();

  await page.getByPlaceholder("Jh").fill("4s");
  await page.getByRole("button", { name: "Deal" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByRole("button", { name: "Check" }).click();

  await page
    .getByPlaceholder("Ah Kh or unknown unknown")
    .fill("unknown unknown");
  await page.getByRole("button", { name: "Show 2" }).click();
  await page.getByRole("button", { name: "Win 2" }).click();
  await page.getByRole("button", { name: "Export" }).click();

  await expect(page.getByText("Last hand export")).toBeVisible();
  await expect(page.getByText("Board: As 7d 2c Jh 4s")).toBeVisible();
  await expect(page.getByText("Needs review:")).toBeVisible();
});
