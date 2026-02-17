import { test, expect, navigateWithAuth } from '../fixtures/test-fixtures.js';

/**
 * E2E tests for court reviews (submit, edit, delete).
 *
 * Uses the auto-seeded court "South Mission Beach Volleyball Courts"
 * (slug: south-mission-beach-volleyball-courts-san-diego).
 * Requires `testUser` + `authedPage` for authenticated actions.
 *
 * IMPORTANT: Each test gets a fresh testUser (scope: 'test'), but all are
 * named "Test User". The backend allows one review per player per court,
 * so reviews from different test runs may accumulate. Tests must be
 * self-contained and handle multiple reviews on the page.
 */

const COURT_SLUG = 'south-mission-beach-volleyball-courts-san-diego';
const COURT_URL = `/courts/${COURT_SLUG}`;

/**
 * Navigate to court page with auth resolved.
 */
async function gotoCourtWithAuth(page) {
  await navigateWithAuth(page, COURT_URL);
  await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });
}

/**
 * Submit a review if the user hasn't already reviewed.
 * Returns true if a new review was created.
 */
async function ensureReviewExists(page, { rating = 3, text = 'Test review' } = {}) {
  const writeBtn = page.getByRole('button', { name: 'Write a Review' });
  if (await writeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await writeBtn.click();
    const form = page.locator('[data-testid="court-review-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: `Rate ${rating} star${rating > 1 ? 's' : ''}` }).click();
    await page.getByPlaceholder('Share your experience...').fill(text);
    await page.getByRole('button', { name: 'Submit Review' }).click();
    await expect(form).toBeHidden({ timeout: 15000 });
    return true;
  }
  return false;
}

test.describe('Court Reviews', () => {
  test('submit a court review', async ({ authedPage }) => {
    const page = authedPage;
    await gotoCourtWithAuth(page);

    // Click "Write a Review"
    const writeBtn = page.getByRole('button', { name: 'Write a Review' });
    await expect(writeBtn).toBeVisible({ timeout: 10000 });
    await writeBtn.click();

    // Review form should appear
    const form = page.locator('[data-testid="court-review-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Click 4 stars
    await page.getByRole('button', { name: 'Rate 4 stars' }).click();

    // Enter review text
    const reviewText = `Great courts ${Date.now()}`;
    await page.getByPlaceholder('Share your experience...').fill(reviewText);

    // Submit
    await page.getByRole('button', { name: 'Submit Review' }).click();

    // Form should disappear and review should appear in the list
    await expect(form).toBeHidden({ timeout: 15000 });

    // Our review should now be visible in the reviews list
    await expect(page.locator('[data-testid="court-review-text"]', { hasText: reviewText }))
      .toBeVisible({ timeout: 10000 });
  });

  test('edit own review', async ({ authedPage }) => {
    const page = authedPage;
    await gotoCourtWithAuth(page);

    // Create a review if none exists for this user
    await ensureReviewExists(page, { rating: 3, text: 'Initial review for edit test' });

    // Now click "Edit Your Review" in the header
    const editBtn = page.getByRole('button', { name: 'Edit Your Review' });
    await expect(editBtn).toBeVisible({ timeout: 10000 });
    await editBtn.click();

    // Edit form should appear pre-filled
    const form = page.locator('[data-testid="court-review-form"]');
    await expect(form).toBeVisible({ timeout: 10000 });

    // Change the rating to 5 stars
    await page.getByRole('button', { name: 'Rate 5 stars' }).click();

    // Update the text
    const updatedText = `Updated review ${Date.now()}`;
    const textarea = page.getByPlaceholder('Share your experience...');
    await textarea.clear();
    await textarea.fill(updatedText);

    // Save
    await page.getByRole('button', { name: 'Update Review' }).click();
    await expect(form).toBeHidden({ timeout: 15000 });

    // Reload to ensure fresh review data renders
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.court-detail__name')).toBeVisible({ timeout: 15000 });

    // Verify updated review is visible
    await expect(page.locator('[data-testid="court-review-text"]', { hasText: updatedText }))
      .toBeVisible({ timeout: 10000 });
  });

  test('delete own review', async ({ authedPage }) => {
    const page = authedPage;
    await gotoCourtWithAuth(page);

    // Create a review if none exists for this user
    const reviewText = `Review to delete ${Date.now()}`;
    await ensureReviewExists(page, { rating: 3, text: reviewText });

    // Count reviews before delete
    const reviewsBefore = await page.locator('[data-testid="court-review-card"]').count();

    // Find the first delete button (scoped to own review via .first())
    const deleteBtn = page.getByRole('button', { name: 'Delete review' }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    // Confirm deletion
    const confirmBtn = page.getByRole('button', { name: 'Confirm delete review' }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // Review count should decrease
    if (reviewsBefore > 1) {
      // Other reviews from previous test runs may exist — just verify count decreased
      await expect(page.locator('[data-testid="court-review-card"]'))
        .toHaveCount(reviewsBefore - 1, { timeout: 15000 });
    } else {
      // Only our review existed — "Write a Review" should return
      await expect(page.getByRole('button', { name: 'Write a Review' }))
        .toBeVisible({ timeout: 15000 });
    }
  });

  test('button shows "Edit Your Review" when user already reviewed', async ({
    authedPage,
  }) => {
    const page = authedPage;
    await gotoCourtWithAuth(page);

    // Ensure we have a review
    await ensureReviewExists(page, { rating: 4 });

    // Button should now say "Edit Your Review" instead of "Write a Review"
    await expect(page.getByRole('button', { name: 'Edit Your Review' }))
      .toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Write a Review' }))
      .toBeHidden();
  });
});
