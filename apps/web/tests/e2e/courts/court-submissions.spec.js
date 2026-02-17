import { test, expect, navigateWithAuth } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for court submissions (add new court, suggest edit).
 *
 * Uses `testUser` + `authedPage` for authenticated actions.
 * The "Add Court" form is on the /courts directory page.
 * The "Suggest Edit" form is on individual court detail pages.
 */

const COURT_SLUG = 'south-mission-beach-volleyball-courts-san-diego';

test.describe('Court Submissions', () => {
  test('submit a new court', async ({ authedPage }) => {
    const page = authedPage;

    // Wait for auth to resolve before interacting with auth-gated buttons
    await navigateWithAuth(page, '/courts');

    // Wait for directory to load
    await expect(page.locator('.court-directory__title')).toBeVisible({ timeout: 15000 });

    // Click "Add Court"
    const addBtn = page.getByRole('button', { name: 'Add Court' });
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // Form should appear
    const form = page.locator('.add-court-form');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Fill required fields
    await page.getByPlaceholder('e.g., Manhattan Beach Courts').fill(
      `Test Court ${Date.now()}`,
    );
    await page.getByPlaceholder('Full street address').fill(
      '123 Beach Blvd, San Diego, CA 92109',
    );

    // Select location hub
    const locationSelect = form.locator('select');
    await locationSelect.first().selectOption('socal_sd');

    // Fill optional fields
    const courtsInput = form.locator('input[type="number"]');
    if (await courtsInput.isVisible()) {
      await courtsInput.fill('4');
    }

    // Submit
    await page.getByRole('button', { name: 'Submit Court' }).click();

    // Form should close after successful submission
    await expect(form).toBeHidden({ timeout: 15000 });
  });

  test('suggest edit to existing court', async ({ authedPage }) => {
    const page = authedPage;

    // Wait for auth to resolve before interacting with auth-gated buttons
    await navigateWithAuth(page, `/courts/${COURT_SLUG}`);

    // Wait for court detail to load
    await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });

    // Click "Suggest an Edit"
    const suggestBtn = page.getByRole('button', { name: 'Suggest an Edit' });
    await expect(suggestBtn).toBeVisible({ timeout: 10000 });
    await suggestBtn.click();

    // Suggest edit form should appear
    const form = page.locator('.court-review-form');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Modify a field — change hours
    const hoursInput = form.locator('input[placeholder="e.g. Dawn to dusk"]');
    await expect(hoursInput).toBeVisible();
    await hoursInput.clear();
    await hoursInput.fill('6:00 AM - 10:00 PM');

    // Submit suggestion
    await page.getByRole('button', { name: 'Submit Suggestion' }).click();

    // Form should close on success
    await expect(form).toBeHidden({ timeout: 15000 });
  });

  test('submission form validates required fields', async ({ authedPage }) => {
    const page = authedPage;

    // Wait for auth to resolve before interacting with auth-gated buttons
    await navigateWithAuth(page, '/courts');

    await expect(page.locator('.court-directory__title')).toBeVisible({ timeout: 15000 });

    // Open Add Court form
    await page.getByRole('button', { name: 'Add Court' }).click();
    const form = page.locator('.add-court-form');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Try to submit with empty required fields
    await page.getByRole('button', { name: 'Submit Court' }).click();

    // Form should still be visible (submission blocked by validation)
    await expect(form).toBeVisible();

    // The form uses HTML required attributes, so browser validation will trigger.
    // Alternatively, if JS validation fires first, we check for the error message.
    // Either way, the form should not close.
    await page.waitForTimeout(1000);
    await expect(form).toBeVisible();
  });
});
