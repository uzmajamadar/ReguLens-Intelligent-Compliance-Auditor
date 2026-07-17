import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:5173";

async function loginAsAdmin(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", "admin@regulens.ai");
  await page.fill("#password", "admin123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/documents|\/compliance|\/dashboard/, { timeout: 15000 });
}

test.describe("Navigation & Layout", () => {
  test("sidebar contains expected navigation items", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("link", { name: /documents/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /compliance/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /reports/i })).toBeVisible();
  });

  test("sidebar shows user info", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByText(/admin/i)).toBeVisible();
  });

  test("can navigate to documents page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: /documents/i }).first().click();
    await expect(page).toHaveURL(/\/documents/);
  });

  test("can navigate to compliance page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: /compliance/i }).first().click();
    await expect(page).toHaveURL(/\/compliance/);
  });

  test("can navigate to reports page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: /reports/i }).first().click();
    await expect(page).toHaveURL(/\/reports/);
  });
});

test.describe("Documents Page", () => {
  test("displays documents list view", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/documents`);
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("shows upload button or area", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/documents`);
    await expect(
      page.getByRole("button", { name: /upload/i }).or(
        page.getByText(/upload|drag.*drop|drop.*file/i)
      )
    ).toBeVisible();
  });
});

test.describe("Settings Page", () => {
  test("displays settings page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.getByRole("heading")).toBeVisible();
  });
});

test.describe("Admin Page", () => {
  test("admin can access admin dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin`);
    await expect(page.getByRole("heading")).toBeVisible({ timeout: 10000 });
  });

  test("admin can view users list", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/admin/users`);
    await expect(page.getByRole("heading")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Profile Page", () => {
  test("displays profile page with user info", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${BASE_URL}/profile`);
    await expect(page.getByRole("heading")).toBeVisible();
  });
});
