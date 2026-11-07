import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage.js';

async function openLogin(page) {
  const home = new HomePage(page);
  await home.goto();
  await home.clickSignIn();
  return page.getByRole('dialog', { name: 'Welcome back' });
}

for (const colorScheme of ['light', 'dark']) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    test(`sign-in fits ${viewport.width}px in ${colorScheme} mode`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      const dialog = await openLogin(page);
      await expect(dialog).toBeVisible();
      await expect(page.locator('nav')).toBeAttached();
      const bounds = await dialog.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect(dialog.getByRole('radio', { name: 'Phone number' })).toBeChecked();
      await dialog.getByRole('radio', { name: 'Email', exact: true }).check();
      await expect(dialog.getByRole('textbox', { name: 'Email', exact: true })).toBeVisible();
      const submit = dialog.getByRole('button', { name: 'Log In', exact: true });
      await submit.scrollIntoViewIfNeeded();
      expect((await submit.boundingBox()).height).toBeGreaterThanOrEqual(48);
      const signup = dialog.getByRole('button', { name: 'Sign up', exact: true });
      await signup.scrollIntoViewIfNeeded();
      await expect(signup).toBeInViewport();
    });
  }
}

test('supports password visibility, validation, recovery, keyboard trapping and dismissal', async ({ page }) => {
  const dialog = await openLogin(page);
  const password = dialog.getByLabel('Password', { exact: true });
  await password.fill('test-password');
  await dialog.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('test-password');
  await dialog.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await dialog.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please enter a valid phone number');
  await dialog.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('dialog', { name: 'Send Code' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const reopened = await openLogin(page);
  const signup = reopened.getByRole('button', { name: 'Sign up', exact: true });
  const close = reopened.getByRole('button', { name: 'Close authentication modal' });
  await signup.focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(signup).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(reopened).not.toBeVisible();
});
