import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

test.describe("Authentication Flow", () => {
  test.describe("Login Page", () => {
    test("displays login form with email and password fields", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
      await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    });

    test("shows default credentials hint", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await expect(page.getByText("admin@regulens.ai")).toBeVisible();
    });

    test("has link to forgot password", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
    });

    test("has link to signup page", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await expect(page.getByRole("link", { name: /create an account/i })).toBeVisible();
    });

    test("shows password visibility toggle", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      const passwordField = page.locator("#password");
      await expect(passwordField).toHaveAttribute("type", "password");
      const toggle = page.locator("button").filter({ has: page.locator("svg") }).first();
      await toggle.click();
      await expect(passwordField).toHaveAttribute("type", "text");
    });

    test("shows error on invalid credentials", async ({ page }) => {
      await page.goto(`${BASE_URL}/login`);
      await page.fill("#email", "wrong@test.com");
      await page.fill("#password", "wrongpassword");
      await page.getByRole("button", { name: /sign in/i }).click();
      await expect(page.getByText(/invalid|incorrect|wrong/i)).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Signup Page", () => {
    test("displays signup form", async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);
      await expect(page.locator("#organization")).toBeVisible();
      await expect(page.locator("#name")).toBeVisible();
      await expect(page.locator("#email")).toBeVisible();
      await expect(page.locator("#password")).toBeVisible();
    });

    test("has link back to login", async ({ page }) => {
      await page.goto(`${BASE_URL}/signup`);
      await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
    });
  });

  test.describe("Landing Page", () => {
    test("displays hero section", async ({ page }) => {
      await page.goto(`${BASE_URL}/`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test("has navigation links", async ({ page }) => {
      await page.goto(`${BASE_URL}/`);
      await expect(page.getByRole("link", { name: /login/i })).toBeVisible();
    });
  });
});

test.describe("Protected Route Redirects", () => {
  const protectedRoutes = ["/documents", "/compliance", "/reports", "/settings", "/profile"];

  for (const route of protectedRoutes) {
    test(`redirects unauthenticated user from ${route} to login`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route}`);
      await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
    });
  }
});
