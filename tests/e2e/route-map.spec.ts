import { expect, test } from "@playwright/test";
import {
  bootstrapFixture,
  workflowFixture,
} from "../../frontend/src/test-fixtures";

test.beforeEach(async ({ page }) => {
  const workflow = { ...workflowFixture, status: "blocked" };
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({ json: bootstrapFixture }),
  );
  await page.route("**/api/workflows?*", (route) =>
    route.fulfill({ json: { items: [workflow], total: 1 } }),
  );
  await page.route(`**/api/workflows/${workflow.id}`, (route) =>
    route.fulfill({ json: workflow }),
  );
});

test("geographic route motion is directional, pausable and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const map = page.getByRole("region", {
    name: "Visualisation des routes européennes",
  });
  await map.scrollIntoViewIfNeeded();
  await expect(map.locator('[data-country="FR"]')).toHaveClass(
    /map-country-market/,
  );
  await expect(map.locator('[data-country="BE"]')).toHaveClass(
    /map-country-selected/,
  );
  await expect(map.locator('[data-route="belgium"]')).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(map).toHaveAttribute("data-motion-running", "true");
  const particle = map.locator(".map-route-particle").first();
  await expect(particle).toHaveCSS("animation-name", "map-route-travel");
  const start = await particle.evaluate(
    (element) => getComputedStyle(element).offsetDistance,
  );
  await expect
    .poll(() =>
      particle.evaluate((element) => getComputedStyle(element).offsetDistance),
    )
    .not.toBe(start);
  await map.getByRole("button", { name: "Pause des animations" }).click();
  await expect(map).toHaveAttribute("data-motion", "disabled");
  await map.getByRole("button", { name: "Animer les flux" }).click();
  await expect(map).toHaveAttribute("data-motion", "enabled");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    map.getByRole("button", { name: "Mouvement réduit" }),
  ).toBeDisabled();
  await expect(particle).toHaveCSS("animation-name", "none");
  await expect(map.locator(".map-route-selected")).toBeVisible();
});

test("map loops pause when the control tower is offscreen", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const map = page.locator(".route-card");
  await map.scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute("data-motion-running", "true");
  await page.locator(".main-footer").scrollIntoViewIfNeeded();
  await expect(map).toHaveAttribute("data-motion-running", "false");
  await expect(map.locator(".map-route-particle").first()).toHaveCSS(
    "animation-play-state",
    "paused",
  );
});

test("mobile dark map retains geography, readable summary and keyboard control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const map = page.locator(".route-card");
  await map.scrollIntoViewIfNeeded();
  await expect(map.getByText("12 000 unités exposées")).toBeVisible();
  const svgBox = await map.locator('svg[role="img"]').boundingBox();
  const summaryBox = await map.locator(".map-summary").boundingBox();
  expect(svgBox).not.toBeNull();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.y).toBeGreaterThanOrEqual(svgBox!.y + svgBox!.height);
  expect(
    await map
      .locator(".map-summary > strong")
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 2,
    ),
  ).toBe(true);
  const button = map.getByRole("button", { name: "Pause des animations" });
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(map).toHaveAttribute("data-motion", "disabled");
});
