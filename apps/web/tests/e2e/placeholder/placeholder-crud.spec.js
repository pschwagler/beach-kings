import { test, expect } from '../fixtures/test-fixtures.js';
import {
  createPlaceholderPlayer,
  getMatchIsRanked,
  getMatchPlayerIds,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';
import { executeQuery } from '../fixtures/db.js';

/**
 * Placeholder Players — CRUD & is_ranked tests (Epics 7.1, 7.3).
 *
 * Covers:
 *   A. Inline creation during match entry
 *   B. Match containing placeholder is is_ranked=false
 *   C. Delete placeholder via Pending Invites tab
 *   D. Empty state when no pending invites
 */

test.describe('Placeholder CRUD', () => {
  test('A — inline placeholder creation during match entry', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId } = leagueWithPlayers;
    const placeholderName = `NewPH ${Date.now()}`;

    // Navigate to league Games tab
    await page.goto(`/league/${leagueId}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => {
        const content = document.querySelector('.league-content');
        if (!content) return false;
        return content.querySelectorAll('.skeleton-text').length === 0;
      },
      { timeout: 15000 }
    );

    // Click Games tab
    const gamesTab = page.locator('[data-testid="matches-tab"]').first();
    await gamesTab.waitFor({ state: 'visible', timeout: 10000 });
    await gamesTab.click();

    // Click Add Game (creates session if none exists)
    const addGameButton = page.locator(
      '[data-testid="session-btn-add"], [data-testid="add-matches-card"], .add-matches-card'
    ).first();
    await addGameButton.waitFor({ state: 'visible', timeout: 15000 });
    await addGameButton.click();

    // Wait for match modal
    await page.waitForSelector(
      '[data-testid="add-match-modal"], .drawer-modal',
      { state: 'visible', timeout: 10000 }
    );

    // Find ANY player input in the modal — grab the first one available
    const playerInput = page.locator('input.player-dropdown-input').first();
    await playerInput.waitFor({ state: 'visible', timeout: 5000 });
    await playerInput.click();
    await playerInput.fill(placeholderName);

    // Wait for the "Add [name]" create-placeholder option
    const createOption = page.locator('.player-dropdown-option.create-placeholder').first();
    await createOption.waitFor({ state: 'visible', timeout: 5000 });

    // Click create-placeholder and wait for API response
    const createResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/players/placeholder') &&
        r.request().method() === 'POST',
      { timeout: 10000 }
    );
    await createOption.click();
    const resp = await createResponse;
    expect(resp.status()).toBe(200);

    // Verify placeholder badge appears in the dropdown / selected state
    const badge = page.locator('.placeholder-badge').first();
    await badge.waitFor({ state: 'visible', timeout: 5000 });
    await expect(badge).toBeVisible();
  });

  test('B — match with placeholder is is_ranked=false', async ({
    testUser,
    leagueWithPlaceholder,
  }) => {
    const { matchId } = leagueWithPlaceholder;

    // Verify directly in the database
    const isRanked = await getMatchIsRanked(matchId);
    expect(isRanked).toBe(false);
  });

  test('C — delete placeholder via Pending Invites tab', async ({
    authedPage,
    testUser,
    leagueWithPlaceholder,
  }) => {
    const page = authedPage;
    const { placeholderName, placeholderPlayerId, matchId } =
      leagueWithPlaceholder;

    // Click "Pending Invites" in sidebar and wait for API response
    const listResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/players/placeholder') &&
        r.request().method() === 'GET',
      { timeout: 15000 }
    );
    await page.locator('text=Pending Invites').click();
    await listResponse;

    // Wait for the placeholder card to appear
    const card = page
      .locator('.pending-invites__card')
      .filter({ hasText: placeholderName });
    await card.waitFor({ state: 'visible', timeout: 10000 });

    // Click delete button
    const deleteBtn = card.locator('.pending-invites__delete-btn');
    await deleteBtn.click();

    // Wait for confirmation modal
    await page.waitForSelector('.confirmation-modal', {
      state: 'visible',
      timeout: 5000,
    });

    // Confirm deletion and wait for DELETE response
    const deleteResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/players/placeholder/') &&
        r.request().method() === 'DELETE',
      { timeout: 10000 }
    );
    await page
      .locator('.confirmation-modal button:has-text("Delete")')
      .click();
    await deleteResponse;

    // Verify card is gone
    await card.waitFor({ state: 'detached', timeout: 5000 });

    // DB check: match FK should reference "Unknown Player", is_ranked=false
    const isRanked = await getMatchIsRanked(matchId);
    expect(isRanked).toBe(false);

    // Verify the placeholder player no longer exists
    const playerResult = await executeQuery(
      'SELECT id FROM players WHERE id = $1',
      [placeholderPlayerId]
    );
    expect(playerResult.rows.length).toBe(0);
  });

  test('D — empty state when no pending invites', async ({
    authedPage,
    testUser,
  }) => {
    const page = authedPage;

    // Click "Pending Invites" in sidebar and wait for API response
    const listResponse = page.waitForResponse(
      (r) =>
        r.url().includes('/api/players/placeholder') &&
        r.request().method() === 'GET',
      { timeout: 15000 }
    );
    await page.locator('text=Pending Invites').click();
    await listResponse;

    // Wait for the empty state to appear
    const emptyTitle = page.locator('.pending-invites__empty-title');
    await emptyTitle.waitFor({ state: 'visible', timeout: 10000 });
    await expect(emptyTitle).toHaveText('No pending invites');
  });
});
