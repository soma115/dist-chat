const { test, expect } = require('@playwright/test');

test.describe('Distributed Chat PWA', () => {
  test('wyświetla ekran startowy i reaguje na przycisk', async ({ page }) => {
    await page.goto('/');
    const setup = page.locator('#setup');
    await expect(setup).toBeVisible();
    const nameInput = page.locator('#name-input');
    const startBtn = page.locator('#start-btn');
    await expect(nameInput).toBeVisible();
    await expect(startBtn).toBeVisible();

    await nameInput.fill('Tester');
    await startBtn.click();

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#my-uuid')).toContainText(/[0-9a-f-]{36}/);
  });

  test('blokuje pusty nick', async ({ page }) => {
    await page.goto('/');
    const startBtn = page.locator('#start-btn');
    await startBtn.click();
    await expect(page.locator('#setup')).toBeVisible();
  });

  test('istnieje UUID i przycisk kopiowania', async ({ page }) => {
    await page.goto('/');
    await page.locator('#name-input').fill('Tester');
    await page.locator('#start-btn').click();
    const uuid = page.locator('#my-uuid');
    await expect(uuid).toBeVisible();
    const text = await uuid.textContent();
    expect(text).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
