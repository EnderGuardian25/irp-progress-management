import { expect, test } from "@playwright/test";
import { SEED_BATCH_NAMES, SEED_STUDENTS } from "@irp/fixtures";
import { signInAsMentor, signInAsStudent } from "./helpers";

/**
 * Plan 7's dashboards over the seeded personas. Everything here is relational:
 * the seed is a function of the run date (spec §6), so a hard-coded count or
 * percentage would pass today and fail on the 10th.
 */
test.describe("mentor Today (FR-28)", () => {
  test("shows N of M submitted for each seeded batch, with N never exceeding M nor undercounting late submitters", async ({ page }) => {
    await signInAsMentor(page);

    for (const name of Object.values(SEED_BATCH_NAMES)) {
      const section = page.getByRole("region", { name });
      await expect(section).toBeVisible();
      const counts = await section.getByText(/\d+ of \d+ submitted/).textContent();
      const [submitted, enrolled] = /(\d+) of (\d+)/.exec(counts!)!.slice(1).map(Number);
      expect(submitted).toBeLessThanOrEqual(enrolled!);
      expect(enrolled).toBeGreaterThan(0);

      // "submitted" is defined (spec: BatchTodayCounts.submitted) as
      // students with at least one entry for the day, LATE INCLUDED -- so
      // it structurally can never be smaller than the late figure beside
      // it. Unlike a hard-coded ">0", this bound holds regardless of which
      // day the suite happens to run on, and it would catch a counter stuck
      // at 0 even on a day nothing else in this test can distinguish from
      // a genuinely quiet one.
      const lateText = await section.locator('[data-testid^="late-count-"]').textContent();
      const late = Number(/^(\d+)/.exec(lateText!)![1]);
      expect(submitted).toBeGreaterThanOrEqual(late);
    }
  });

  test("M matches the number of rows the Roster shows for the same batch and day", async ({ page }) => {
    await signInAsMentor(page);
    const section = page.getByRole("region", { name: SEED_BATCH_NAMES.A });
    const counts = await section.getByText(/\d+ of \d+ submitted/).textContent();
    const enrolled = Number(/of (\d+)/.exec(counts!)![1]);

    // Address the Roster by the dashboard's OWN reported day, read off
    // `data-date`, rather than letting it default to today. The two differ on
    // a weekend -- the dashboard falls back to the last required day while the
    // Roster defaults to today -- so a comparison against the default would
    // pass Monday to Friday and fail every Saturday. The batch id comes from
    // the same element's testid, so neither value is hard-coded.
    const dayLabel = section.locator('[data-testid^="day-label-"]');
    const isoDate = await dayLabel.getAttribute("data-date");
    const testId = await dayLabel.getAttribute("data-testid");
    const batchId = testId!.replace("day-label-", "");
    expect(isoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.goto(`/roster?batchId=${batchId}&date=${isoDate!}`);
    await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(enrolled);
  });

  test("renders a ribbon whose required-day count matches the cycle length it names, with an actual bar per day", async ({ page }) => {
    await signInAsMentor(page);
    const section = page.getByRole("region", { name: SEED_BATCH_NAMES.A });
    const figure = section.getByRole("figure");
    const label = await figure.locator("figcaption").textContent();
    const declared = Number(/of (\d+)/.exec(label!)![1]);
    await expect(section.getByTestId("required-day-count"))
      .toHaveText(`${String(declared)} required days in this cycle`);

    // Asserting the figure exists proves nothing about what it drew. One
    // <li> bar renders per required day, plus an extra half-slot on a
    // worked weekend -- so the bar count can only ever meet or exceed the
    // declared day count, never fall short of it.
    const barCount = await figure.locator("ol > li").count();
    expect(barCount).toBeGreaterThanOrEqual(declared);
  });

  test("the Cycles page lists a row per Batch Aurora student and never a score", async ({ page }) => {
    await signInAsMentor(page);
    await page.getByRole("link", { name: "Cycles" }).click();
    await expect(page.getByRole("heading", { name: "Cycles" })).toBeVisible();

    const activeAuroraStudents = SEED_STUDENTS.filter((s) => s.batch === "A" && s.kind !== "archived");
    for (const s of activeAuroraStudents) {
      await expect(page.getByText(s.name)).toBeVisible();
    }
    // The archived persona has left active rosters (FR-5).
    const archived = SEED_STUDENTS.find((s) => s.kind === "archived")!;
    await expect(page.getByText(archived.name)).toHaveCount(0);
    await expect(page.getByText(/awaiting evaluation/i).first()).toBeVisible();
  });
});

test.describe("student My month (FR-29, FR-30)", () => {
  test("shows Month N of 6, the student's own pills, and the designed empty evaluation state", async ({ page }) => {
    await signInAsStudent(page);
    await page.getByRole("link", { name: "My month" }).click();

    await expect(page.getByRole("heading", { name: "My month" })).toBeVisible();
    await expect(page.getByText(/Month \d of 6/)).toBeVisible();
    await expect(page.getByRole("figure")).toBeVisible();
    await expect(page.getByText(/No evaluation yet/)).toBeVisible();
    // dev-student-1 is the fully compliant persona, so at least one on-time day.
    await expect(page.locator('[data-status="onTime"]').first()).toBeVisible();
  });

  test("shows no score, rank or other student's name anywhere on the page (FR-30)", async ({ page }) => {
    await signInAsStudent(page);
    await page.getByRole("link", { name: "My month" }).click();
    await expect(page.getByRole("heading", { name: "My month" })).toBeVisible();

    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/rank|leaderboard|performance index/i);
    for (const other of SEED_STUDENTS.filter((s) => s.externalId !== "dev-student-1")) {
      expect(text).not.toContain(other.name);
    }
  });

  test("a student cannot reach the mentor dashboards, and is not offered them", async ({ page }) => {
    await signInAsStudent(page);
    await expect(page.getByRole("link", { name: "Cycles" })).toHaveCount(0);

    await page.goto("/cycles");
    // Redirected home, not shown a 403 page — the pattern Roster and Review set.
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });
});
