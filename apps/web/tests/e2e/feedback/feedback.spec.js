import { test, expect, authenticateAndGotoHome } from '../fixtures/test-fixtures.js';
import { failApi } from '../utils/network-failures.js';

async function openFeedback(page) {
  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('navigation', { name: 'Site navigation' })
    .getByRole('button', { name: 'Leave Feedback' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave Feedback' })).toBeVisible();
}

test.describe('Feedback lifecycle @p1 @admin', () => {
  test('successful feedback persists into the admin queue', async ({
    authedPage,
    adminUser,
    browser,
  }) => {
    const marker = `E2E feedback ${Date.now()}`;
    await openFeedback(authedPage);
    await authedPage.getByLabel('Your Feedback').fill(marker);
    await authedPage.getByRole('button', { name: 'Send Feedback' }).click();
    await expect(authedPage.getByRole('heading', { name: 'Thank You!' })).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    try {
      await authenticateAndGotoHome(adminPage, adminUser);
      await adminPage.goto('/admin-view?tab=feedback');
      await expect(adminPage.getByRole('heading', { name: 'Feedback', exact: true })).toBeVisible();
      await expect(adminPage.getByText(marker)).toBeVisible({ timeout: 15_000 });
    } finally {
      await adminContext.close();
    }
  });

  test('500 response preserves the draft and allows retry @p0', async ({ authedPage }) => {
    await failApi(authedPage, '**/api/feedback', 500, { detail: 'Controlled feedback failure' });
    await openFeedback(authedPage);
    const field = authedPage.getByLabel('Your Feedback');
    await field.fill('Draft retained after controlled failure');
    await authedPage.getByRole('button', { name: 'Send Feedback' }).click();
    await expect(authedPage.getByRole('alert')).toContainText('Controlled feedback failure');
    await expect(field).toHaveValue('Draft retained after controlled failure');
  });

  test('Escape closes the dialog and restores focus to the menu trigger @p2', async ({ authedPage }) => {
    const trigger = authedPage.getByRole('button', { name: 'User menu' });
    await openFeedback(authedPage);
    await authedPage.keyboard.press('Escape');
    await expect(authedPage.getByRole('dialog', { name: 'Leave Feedback' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
