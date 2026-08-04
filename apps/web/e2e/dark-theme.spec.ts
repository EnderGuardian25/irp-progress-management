import { expect, test } from "@playwright/test";
import { signInAsMentor } from "./helpers";

/**
 * The dark guard. Runs ONLY under the `chromium-dark` project
 * (playwright.config.ts scopes it by testMatch), where colorScheme: "dark"
 * makes prefers-color-scheme report dark.
 *
 * Read-only ON PURPOSE. The mutating suites (mentor-flows, student-flows)
 * submit entries, walk reports irreversibly to Evaluated, and reseed mid-run;
 * running them twice in one serial pass is the state-dependence that made this
 * suite flaky before `workers: 1` was pinned. This spec navigates and asserts
 * rendering, nothing else.
 *
 * What it can and cannot catch: it proves every view renders and its landmark
 * content is present with the OS in dark. It does NOT judge whether dark LOOKS
 * right — that is the human pass in Task 9. A test cannot tell you a border
 * vanished into a canvas.
 */
test.describe("dark theme renders every view", () => {
  test("mentor views render with the OS in dark", async ({ page }) => {
    await signInAsMentor(page);

    // Proves colorScheme: "dark" is actually applied by this project rather
    // than silently ignored — without this the whole chromium-dark project
    // could be a no-op that passes for the wrong reason. Keep permanently.
    expect(await page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches)).toBe(
      true,
    );

    for (const [path, heading] of [
      ["/", "Today"],
      ["/roster", "Roster"],
      ["/review", "Review"],
      ["/cycles", "Cycles"],
      ["/students", "Students"],
      ["/settings", "Settings"],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    }
  });

  test("the ribbon's marks are still drawn when the canvas is dark", async ({ page }) => {
    // The `future` mark is a transparent bar with a --line border: the
    // lowest-contrast element in the system and the likeliest to disappear
    // against a dark canvas. Its presence is assertable; its visibility is not.
    await signInAsMentor(page);
    await page.goto("/");
    await expect(page.getByTestId("ribbon-bar").first()).toBeVisible();
  });

  test("the theme key and its swatches survive dark", async ({ page }) => {
    await signInAsMentor(page);
    await page.goto("/");
    const key = page.getByTestId("ribbon-key");
    await expect(key).toBeVisible();
    await key.getByText("How to read this").click();
    // exact: true -- the key's own closing paragraph ("...missed, then late,
    // then absent, then partly in, then on time.") contains the substring
    // "on time" too, so the default case-insensitive substring match resolves
    // to two elements (the <dt>'s swatch label and that trailing <p>) and
    // trips Playwright's strict mode. The <dt> is the one this test means.
    await expect(key.getByText("On time", { exact: true })).toBeVisible();
  });
});
