import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for managing league members (add, remove, change role).
 *
 * Uses `testUser` (league admin) + `secondTestUser` (member to add/manage).
 * Member management is on the league's Details tab → Players section.
 */

test.describe('Manage Members', () => {
  test('add player to league via UI', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create a league via API
    const league = await createTestLeague(testUser.token, {
      name: `Members League ${Date.now()}`,
    });

    // Navigate to league details tab
    await page.goto(`/league/${league.id}?tab=details`);
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

    // Click "Add Players" in the Players section
    const addBtn = page.locator('.league-players-section .league-text-button');
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();

    // Add Players modal should open
    const modal = page.locator('.add-players-modal');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Search for a player (there should be players from test DB)
    const searchInput = page.locator('#player-search');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('Test');

    // Wait for search results
    await page.waitForTimeout(500); // debounce
    const playerRow = page.locator('.add-players-table-row').first();
    await expect(playerRow).toBeVisible({ timeout: 10000 });

    // Click the add button (Plus icon) on the first result
    await playerRow.locator('.add-players-table-add').click();

    // Player should be marked as selected
    await expect(playerRow).toHaveClass(/selected/, { timeout: 5000 });

    // Click "Add Players" to confirm
    await page.locator('.league-text-button.primary', { hasText: 'Add Players' }).click();

    // Modal should close
    await expect(modal).toBeHidden({ timeout: 15000 });

    // Player should appear in the members list
    const membersList = page.locator('.league-players-list');
    await expect(membersList).toBeVisible({ timeout: 10000 });
  });

  test('remove member from league', async ({ authedPage, testUser, secondTestUser }) => {
    const page = authedPage;

    // Create a league and add secondTestUser as member via API
    const league = await createTestLeague(testUser.token, {
      name: `Remove Member League ${Date.now()}`,
      is_open: true,
    });

    // secondTestUser joins the league
    const api = createApiClient(secondTestUser.token);
    await api.post(`/api/leagues/${league.id}/join`);

    // Navigate to league details tab as admin
    await page.goto(`/league/${league.id}?tab=details`);
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

    // Wait for members list to load
    await expect(page.locator('.league-players-list')).toBeVisible({ timeout: 10000 });

    // Find the member row for secondTestUser
    const memberRow = page.locator('.league-player-row', {
      hasText: secondTestUser.fullName,
    });
    await expect(memberRow).toBeVisible({ timeout: 10000 });

    // Click the remove button (X icon)
    await memberRow.locator('.league-player-remove').click();

    // Confirmation modal should appear
    const confirmModal = page.locator('.confirmation-modal');
    await expect(confirmModal).toBeVisible({ timeout: 5000 });
    await confirmModal.getByRole('button', { name: 'Remove' }).click();

    // Member should be removed from the list
    await expect(memberRow).toBeHidden({ timeout: 15000 });
  });

  test('change member role to admin', async ({ authedPage, testUser, secondTestUser }) => {
    const page = authedPage;

    // Create a league and add secondTestUser
    const league = await createTestLeague(testUser.token, {
      name: `Role Change League ${Date.now()}`,
      is_open: true,
    });

    const api = createApiClient(secondTestUser.token);
    await api.post(`/api/leagues/${league.id}/join`);

    // Navigate to league details tab
    await page.goto(`/league/${league.id}?tab=details`);
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });

    // Wait for members list
    await expect(page.locator('.league-players-list')).toBeVisible({ timeout: 10000 });

    // Find the member row
    const memberRow = page.locator('.league-player-row', {
      hasText: secondTestUser.fullName,
    });
    await expect(memberRow).toBeVisible({ timeout: 10000 });

    // Change role via the role dropdown
    const roleSelect = memberRow.locator('.league-role-select');
    await expect(roleSelect).toBeVisible({ timeout: 5000 });
    await roleSelect.selectOption('admin');

    // Wait for the update to apply
    await page.waitForTimeout(1000);

    // Reload and verify the role persists
    await page.reload();
    await page.waitForSelector('[data-testid="details-tab"]', { timeout: 15000 });
    await expect(page.locator('.league-players-list')).toBeVisible({ timeout: 10000 });

    const updatedRow = page.locator('.league-player-row', {
      hasText: secondTestUser.fullName,
    });
    const updatedRole = updatedRow.locator('.league-role-select');
    await expect(updatedRole).toHaveValue('admin');
  });
});
