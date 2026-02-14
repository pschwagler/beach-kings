import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague, createTestSeason, addPlayerToLeague } from '../utils/test-helpers.js';

/**
 * E2E tests for the CreateGameModal flow.
 *
 * Covers:
 *   - Pickup game creation via MyGamesTab and NavBar
 *   - League game flow with 0, 1, and multiple leagues
 *   - autoAddMatch deep-link and URL cleanup
 */
test.describe('CreateGameModal', () => {
  // Run sequentially — these tests share the same server and are order-independent
  // but concurrent auth-setup can overwhelm the dev server.
  test.describe.configure({ mode: 'serial' });

  // ─── Pickup via MyGamesTab ────────────────────────────────────────────
  test('pickup game via MyGamesTab — creates session and redirects', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Navigate to My Games tab (authedPage already loaded /home)
    await page.click('text=My Games');
    await page.waitForSelector('.my-games-tab-container', { state: 'visible', timeout: 10000 });

    // Click "Create game" button
    await page.click('button:has-text("Create game")');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    // Verify both options visible; League Game should be disabled (no leagues)
    const leagueBtn = page.locator('.create-game-modal__option').first();
    const pickupBtn = page.locator('button.create-game-modal__option:has-text("Pickup Game")');
    await expect(leagueBtn).toHaveClass(/create-game-modal__option--disabled/);
    await expect(leagueBtn).toBeDisabled();
    await expect(pickupBtn).toBeEnabled();

    // Click Pickup Game → redirect to /session/<code>
    await pickupBtn.click();
    await page.waitForURL('**/session/**', { timeout: 15000 });
    expect(page.url()).toMatch(/\/session\/.+/);
  });

  // ─── Pickup via NavBar ────────────────────────────────────────────────
  test('pickup game via NavBar — creates session and redirects', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Click navbar "Add Games" button
    await page.click('button[aria-label="Add Games"]');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    // Click Pickup Game
    const pickupBtn = page.locator('button.create-game-modal__option:has-text("Pickup Game")');
    await expect(pickupBtn).toBeEnabled();
    await pickupBtn.click();
    await page.waitForURL('**/session/**', { timeout: 15000 });
    expect(page.url()).toMatch(/\/session\/.+/);
  });

  // ─── Zero leagues — disabled state ────────────────────────────────────
  test('zero leagues — League Game button is disabled with helper text', async ({ authedPage, testUser }) => {
    const page = authedPage;

    await page.click('button[aria-label="Add Games"]');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    const leagueBtn = page.locator('.create-game-modal__option').first();
    await expect(leagueBtn).toHaveClass(/create-game-modal__option--disabled/);
    await expect(leagueBtn).toBeDisabled();
    await expect(page.locator('.create-game-modal__option-desc:has-text("Join a league to unlock")')).toBeVisible();
  });

  // ─── League game — single league (auto-select) ───────────────────────
  test('single league — auto-selects and opens AddMatchModal', async ({ authedPage, testUser, leagueWithPlayers }) => {
    const page = authedPage;
    const { leagueId } = leagueWithPlayers;

    // Open modal from navbar
    await page.click('button[aria-label="Add Games"]');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    // Wait for leagues to load (button becomes enabled)
    const leagueBtn = page.locator('button.create-game-modal__option:has-text("League Game")');
    await expect(leagueBtn).toBeEnabled({ timeout: 10000 });

    // Click League Game — should auto-select the only league (skip step 2)
    await leagueBtn.click();

    // Should navigate to league page with matches tab
    await page.waitForURL(`**/league/${leagueId}**`, { timeout: 15000 });
    expect(page.url()).toContain(`/league/${leagueId}`);
    expect(page.url()).toContain('tab=matches');

    // AddMatchModal should auto-open (league has 4 players)
    await page.waitForSelector('.drawer-modal, [data-testid="add-match-modal"]', {
      state: 'visible',
      timeout: 15000,
    });

    // autoAddMatch param should be cleaned from URL
    await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('autoAddMatch');
  });

  // ─── League game — multiple leagues (step 2 picker) ──────────────────
  test('multiple leagues — shows league picker, back works, selects league', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const { token } = testUser;

    // Create 2 leagues with seasons and 4 players each (required for AddMatchModal)
    const league1 = await createTestLeague(token, { name: `League Alpha ${Date.now()}` });
    const season1 = await createTestSeason(token, league1.id, { name: 'Season 1' });
    const playerNames1 = [`P1 ${Date.now()}`, `P2 ${Date.now()}`, `P3 ${Date.now()}`, `P4 ${Date.now()}`];
    for (const name of playerNames1) {
      await addPlayerToLeague(token, league1.id, name);
    }

    const league2 = await createTestLeague(token, { name: `League Beta ${Date.now()}` });
    const season2 = await createTestSeason(token, league2.id, { name: 'Season 1' });
    const playerNames2 = [`P5 ${Date.now()}`, `P6 ${Date.now()}`, `P7 ${Date.now()}`, `P8 ${Date.now()}`];
    for (const name of playerNames2) {
      await addPlayerToLeague(token, league2.id, name);
    }

    // Open modal
    await page.click('button[aria-label="Add Games"]');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    // Wait for leagues to load
    const leagueBtn = page.locator('button.create-game-modal__option:has-text("League Game")');
    await expect(leagueBtn).toBeEnabled({ timeout: 10000 });

    // Click League Game → step 2 league picker
    await leagueBtn.click();
    await expect(page.locator('.create-game-modal__title')).toHaveText('Select League');
    await expect(page.locator('.create-game-modal__leagues')).toBeVisible();

    // Verify both leagues are listed
    const leagueItems = page.locator('.create-game-modal__league-item');
    await expect(leagueItems).toHaveCount(2, { timeout: 5000 });

    // Back arrow returns to step 1
    await page.click('button[aria-label="Back"]');
    await expect(page.locator('.create-game-modal__title')).toHaveText('Create Game');

    // Go back to step 2 and select a league
    await leagueBtn.click();
    await expect(page.locator('.create-game-modal__leagues')).toBeVisible();

    // Click the first league
    const firstLeagueItem = leagueItems.first();
    const firstLeagueName = await firstLeagueItem.locator('.create-game-modal__league-name').textContent();
    await firstLeagueItem.click();

    // Should navigate to league page with matches tab
    await page.waitForURL('**/league/**', { timeout: 15000 });
    expect(page.url()).toContain('tab=matches');

    // AddMatchModal should auto-open
    await page.waitForSelector('.drawer-modal, [data-testid="add-match-modal"]', {
      state: 'visible',
      timeout: 15000,
    });

    // autoAddMatch param should be cleaned from URL
    await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('autoAddMatch');
  });

  // ─── League with no active season — error handling ──────────────────
  test('league with no active season — League Game still navigates to league', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const { token } = testUser;

    // Create a league with NO season
    const league = await createTestLeague(token, { name: `No Season League ${Date.now()}` });

    // Open modal
    await page.click('button[aria-label="Add Games"]');
    await page.waitForSelector('.create-game-modal', { state: 'visible', timeout: 5000 });

    // Wait for leagues to load
    const leagueBtn = page.locator('button.create-game-modal__option:has-text("League Game")');
    await expect(leagueBtn).toBeEnabled({ timeout: 10000 });

    // Click League Game — should navigate to league page
    await leagueBtn.click();
    await page.waitForURL(`**/league/${league.id}**`, { timeout: 15000 });
    expect(page.url()).toContain(`/league/${league.id}`);
    expect(page.url()).toContain('tab=matches');

    // Without a season, the matches tab should show the "No seasons found" empty state
    // (AddMatchModal should NOT auto-open since there are no seasons)
    await expect(page.locator('text=No seasons found')).toBeVisible({ timeout: 10000 });
  });

  // ─── autoAddMatch URL — direct navigation & refresh ──────────────────
  test('autoAddMatch URL — opens modal, cleans param, no re-open on refresh', async ({ authedPage, testUser, leagueWithPlayers }) => {
    const page = authedPage;
    const { leagueId } = leagueWithPlayers;

    // Navigate directly with autoAddMatch param
    await page.goto(`/league/${leagueId}?tab=matches&autoAddMatch=true`);

    // AddMatchModal should auto-open
    await page.waitForSelector('.drawer-modal, [data-testid="add-match-modal"]', {
      state: 'visible',
      timeout: 20000,
    });

    // autoAddMatch param should be removed from URL
    await expect.poll(() => page.url(), { timeout: 5000 }).not.toContain('autoAddMatch');

    // Close the modal via the overlay backdrop
    await page.click('[data-testid="add-match-modal-overlay"]', { position: { x: 5, y: 5 } });
    await page.waitForSelector('.drawer-modal, [data-testid="add-match-modal"]', {
      state: 'hidden',
      timeout: 10000,
    });

    // Refresh the page — param was already cleaned so modal should NOT re-open
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.drawer-modal, [data-testid="add-match-modal"]')).not.toBeVisible({ timeout: 5000 });
  });
});
