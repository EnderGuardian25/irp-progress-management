import { expect, test } from "@playwright/test";

test.describe("the sign-in chain", () => {
  test("a registered mentor signs in and sees their own name from the API", async ({ page }) => {
    await page.goto("/signin");

    // The split treatment: the ribbon is present before sign-in.
    await expect(page.getByText("A mark per working day.")).toBeVisible();

    await page.getByRole("button", { name: /Mentor \(Admin\)/ }).click();

    // Every layer ran: cookie minted, decrypted server-side, bearer token
    // attached by @irp/client, JWT verified against the dev JWKS, User row
    // found in Postgres, name rendered.
    await expect(page.getByTestId("user-name")).toHaveText("Dev Mentor");
    await expect(page.getByTestId("user-role")).toHaveText("Admin");
  });

  test("a registered student sees the Student role from the User row", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /^Student$/ }).click();
    await expect(page.getByTestId("user-name")).toHaveText("Dev Student");
    await expect(page.getByTestId("user-role")).toHaveText("Student");
  });

  test("an unregistered user reaches the terminal 403 page, not a redirect loop", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /Unregistered user/ }).click();

    await expect(page).toHaveURL(/\/not-registered$/);
    await expect(page.getByRole("heading", { name: /not registered/i })).toBeVisible();

    // The trap: this page must offer sign-out, never a link back to /signin,
    // or a valid session bounces straight back and loops forever.
    await expect(page.getByRole("button", { name: /Sign out/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("an unauthenticated visitor is redirected to sign-in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("the browser is never given a bearer token", async ({ page }) => {
    await page.goto("/signin");
    await page.getByRole("button", { name: /Mentor \(Admin\)/ }).click();
    await expect(page.getByTestId("user-name")).toBeVisible();

    // The decisive assertion for spec §4.1. If this body carried the token,
    // any script on the page could call the API directly.
    const body = await page.evaluate(async () => {
      const res = await fetch("/api/auth/session");
      return res.text();
    });

    expect(body).not.toMatch(/accessToken/i);
    expect(body).not.toMatch(/\beyJ[A-Za-z0-9_-]{8,}/);
  });
});
