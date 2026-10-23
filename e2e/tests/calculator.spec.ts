import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const key = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const display = (page: Page) => page.getByRole("status");
/** True when the display's text is wider than the line that clips it. */
const clipped = (page: Page) =>
  display(page)
    .locator(".line-text")
    .evaluate((line) => {
      const text = line.querySelector("bdi");
      return (
        text !== null &&
        text.getBoundingClientRect().width > line.getBoundingClientRect().width
      );
    });

async function press(page: Page, ...names: string[]) {
  for (const name of names) await key(page, name).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(display(page)).toHaveText("0");
});

test("12 + 3 = 15", async ({ page }) => {
  await press(page, "1", "2", "Add", "3", "Equals");
  await expect(display(page)).toHaveText("15");
  await expect(page.getByTestId("expression")).toHaveText("12 + 3 =");
});

test("2 + 3 × 4 = 14, multiplication first", async ({ page }) => {
  await press(page, "2", "Add", "3", "Multiply", "4", "Equals");
  await expect(display(page)).toHaveText("14");
});

test("dividing by zero shows the error and AC recovers", async ({ page }) => {
  await press(page, "1", "Divide", "0", "Equals");
  await expect(display(page)).toHaveText("Cannot divide by zero");
  await press(page, "All clear");
  await expect(display(page)).toHaveText("0");
});

test("typing 2+2= on the keyboard", async ({ page }) => {
  await page.keyboard.type("2+2=");
  await expect(display(page)).toHaveText("4");
});

// The main line is sized by measuring, not by counting characters, so the
// whole result stays visible on the narrowest supported phone.
test("1 ÷ 3 shows the whole result on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await press(page, "1", "Divide", "3", "Equals");
  await expect(display(page)).toHaveText("0.333333333333");
  expect(await clipped(page)).toBe(false);
});

test("fifteen typed digits stay whole on a 320px phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.keyboard.type("123456789012345");
  await expect(display(page)).toHaveText("123456789012345");
  expect(await clipped(page)).toBe(false);
});

test("the division error stays whole on a 320px phone in the monospace theme", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.evaluate(() => localStorage.setItem("calculator.theme", "vscode"));
  await page.reload();
  await press(page, "1", "Divide", "0", "Equals");
  await expect(display(page)).toHaveText("Cannot divide by zero");
  expect(await clipped(page)).toBe(false);
});
