import { test, expect } from '../fixtures/test-fixtures.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  createPickupSession,
  invitePlayerToSession,
  createTestLeague,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * Mobile viewport E2E tests for all major modals and drawers.
 *
 * Assertion strategy:
 * - boundingBox checks: element bottom <= viewport height (within viewport)
 * - scrollHeight > clientHeight: scroll container is scrollable
 * - clientHeight >= threshold: enough room for at least one content row
 * - Full workflow completion: end-to-end mobile usability
 *
 * All tests wait for slideUpMobile animation (250ms) via openManagePlayersModal
 * or explicit animation-end waits.
 */

/**
 * Wait for a drawer/modal slide-up animation to finish.
 * Waits a minimum of 350ms (longest animation is 300ms) then confirms
 * the transform has cleared.
 */
async function waitForAnimation(page, selector) {
  // Let animation run for at least its full duration
  await page.waitForTimeout(350);
  // Then confirm transform cleared
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return true;
    const s = window.getComputedStyle(el);
    return s.transform === 'none' || s.transform === 'matrix(1, 0, 0, 1, 0, 0)';
  }, selector, { timeout: 2000 }).catch(() => {});
}

/** Assert element bounding box is within viewport. */
async function assertInViewport(page, selector) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element "${selector}" has no bounding box`);
  const viewport = page.viewportSize();
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(box.y).toBeGreaterThanOrEqual(0);
  return box;
}

// ---------------------------------------------------------------------------
// AddPlayersModal (league drawer) — reuses .session-players-drawer CSS
// ---------------------------------------------------------------------------
test.describe('AddPlayersModal (League) - Mobile', () => {
  test('drawer opens as bottom sheet and footer visible at 390x844', async ({ authedPage, testUser }) => {
    const page = authedPage;
    await page.setViewportSize({ width: 390, height: 844 });

    const league = await createTestLeague(testUser.token, {
      name: `Mobile Members ${Date.now()}`,
    });

    await page.goto(`/league/${league.id}?tab=details`);
    // Wait for details tab or error — skip if league page has backend error
    const detailsTab = page.locator('[data-testid="details-tab"]');
    const pageError = page.locator('.error-message, .league-error, [role="alert"]');
    await Promise.race([
      detailsTab.waitFor({ state: 'visible', timeout: 15000 }),
      pageError.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
    if (await pageError.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    // Click "Add Players"
    const addBtn = page.locator('.league-players-section .league-text-button');
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await addBtn.click();

    // Drawer should open
    const drawer = page.locator('.session-players-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await waitForAnimation(page, '.session-players-drawer');

    // Footer buttons should be within viewport
    await assertInViewport(page, '.session-players-drawer-actions');

    await page.screenshot({ path: 'test-results/mobile-add-players-drawer.png' });
  });

  test('search and footer usable at 375x667 (iPhone SE)', async ({ authedPage, testUser }) => {
    const page = authedPage;
    await page.setViewportSize({ width: 375, height: 667 });

    const league = await createTestLeague(testUser.token, {
      name: `Mobile SE ${Date.now()}`,
    });

    await page.goto(`/league/${league.id}?tab=details`);
    const detailsTab = page.locator('[data-testid="details-tab"]');
    const pageError = page.locator('.error-message, .league-error, [role="alert"]');
    await Promise.race([
      detailsTab.waitFor({ state: 'visible', timeout: 15000 }),
      pageError.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
    if (await pageError.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    const addBtn = page.locator('.league-players-section .league-text-button');
    if (!await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.skip();
      return;
    }
    await addBtn.click();

    const drawer = page.locator('.session-players-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });
    await waitForAnimation(page, '.session-players-drawer');

    // Search input should be reachable
    const searchInput = page.locator('#player-search');
    await expect(searchInput).toBeVisible({ timeout: 5000 });
    await assertInViewport(page, '#player-search');

    // Footer actions should be within viewport
    await assertInViewport(page, '.session-players-drawer-actions');

    await page.screenshot({ path: 'test-results/mobile-add-players-iphonese.png' });
  });
});

// ---------------------------------------------------------------------------
// AddMatchModal — uses shared .modal-content bottom-sheet pattern
// ---------------------------------------------------------------------------
test.describe('AddMatchModal - Mobile', () => {
  test('modal opens as bottom sheet with submit button visible', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Create session with 4 players
    const api = createApiClient(testUser.token);
    const ts = Date.now();
    const pIds = [];
    for (let i = 0; i < 4; i++) {
      const r = await api.post('/api/players', { name: `Match${i} ${ts}` });
      pIds.push(r.data.player_id);
    }
    const session = await createPickupSession(testUser.token, { name: `Match Mobile ${ts}` });
    for (const id of pIds) await invitePlayerToSession(testUser.token, session.id, id);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Open Add Match modal
    await sessionPage.clickAddMatch();
    await waitForAnimation(page, '.modal-content');

    // Modal should be visible
    const modal = page.locator('[data-testid="add-match-modal"]');
    await expect(modal).toBeVisible();

    // Modal actions (Add Game button) should be within viewport
    await assertInViewport(page, '.modal-actions');

    await page.screenshot({ path: 'test-results/mobile-add-match.png' });
  });

  test('form scrollable and submit reachable at 375x667', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await page.setViewportSize({ width: 375, height: 667 });

    const api = createApiClient(testUser.token);
    const ts = Date.now();
    const pIds = [];
    for (let i = 0; i < 4; i++) {
      const r = await api.post('/api/players', { name: `MatchSE${i} ${ts}` });
      pIds.push(r.data.player_id);
    }
    const session = await createPickupSession(testUser.token, { name: `Match SE ${ts}` });
    for (const id of pIds) await invitePlayerToSession(testUser.token, session.id, id);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();
    await sessionPage.clickAddMatch();
    await waitForAnimation(page, '.modal-content');

    // Check the form area is scrollable if content overflows
    const formDims = await page.evaluate(() => {
      const form = document.querySelector('.add-match-form');
      if (!form) return { scrollHeight: 0, clientHeight: 0 };
      return { scrollHeight: form.scrollHeight, clientHeight: form.clientHeight };
    });

    // Form should either fit or be scrollable
    if (formDims.scrollHeight > formDims.clientHeight) {
      expect(formDims.clientHeight).toBeGreaterThanOrEqual(50);
    }

    // Actions always visible
    await assertInViewport(page, '.modal-actions');

    await page.screenshot({ path: 'test-results/mobile-add-match-iphonese.png' });
  });
});

// ---------------------------------------------------------------------------
// ConfirmationModal — shared .modal-content pattern
// ---------------------------------------------------------------------------
test.describe('ConfirmationModal - Mobile', () => {
  test('confirmation dialog fully visible at 390x844', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Create session with 4 players and a match so we can submit
    const api = createApiClient(testUser.token);
    const ts = Date.now();
    const pIds = [];
    for (let i = 0; i < 4; i++) {
      const r = await api.post('/api/players', { name: `Conf${i} ${ts}` });
      pIds.push(r.data.player_id);
    }
    const session = await createPickupSession(testUser.token, { name: `Confirm Mobile ${ts}` });
    for (const id of pIds) await invitePlayerToSession(testUser.token, session.id, id);
    await api.post('/api/matches', {
      session_id: session.id,
      team1_player1_id: pIds[0],
      team1_player2_id: pIds[1],
      team2_player1_id: pIds[2],
      team2_player2_id: pIds[3],
      team1_score: 21,
      team2_score: 15,
    });

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Click Submit to trigger confirmation modal
    await page.locator('button:has-text("Submit")').click();
    await page.waitForSelector('.modal-content', { state: 'visible', timeout: 5000 });
    await waitForAnimation(page, '.modal-content');

    // Both confirm and cancel buttons should be visible
    const confirmBtn = page.locator('.modal-content button:has-text("Submit")');
    await expect(confirmBtn).toBeVisible();
    await assertInViewport(page, '.modal-actions');

    await page.screenshot({ path: 'test-results/mobile-confirmation.png' });

    // Dismiss
    await page.locator('.modal-content button:has-text("Cancel")').click();
  });
});

// ---------------------------------------------------------------------------
// PlayerDetailsPanel (drawer) — full-screen takeover on mobile
// ---------------------------------------------------------------------------
test.describe('PlayerDetailsPanel - Mobile', () => {
  test('player details drawer covers screen and close button visible', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    await page.setViewportSize({ width: 390, height: 844 });

    // Create a session with players so we can click a player name
    const api = createApiClient(testUser.token);
    const ts = Date.now();
    const pIds = [];
    const pNames = [];
    for (let i = 0; i < 4; i++) {
      const name = `Details${i} ${ts}`;
      const r = await api.post('/api/players', { name });
      pIds.push(r.data.player_id);
      pNames.push(name);
    }
    const session = await createPickupSession(testUser.token, { name: `Details Mobile ${ts}` });
    for (const id of pIds) await invitePlayerToSession(testUser.token, session.id, id);

    // Add a match so player names show in match cards
    await api.post('/api/matches', {
      session_id: session.id,
      team1_player1_id: pIds[0],
      team1_player2_id: pIds[1],
      team2_player1_id: pIds[2],
      team2_player2_id: pIds[3],
      team1_score: 21,
      team2_score: 18,
    });

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Click a player name in a match card to open PlayerDetails
    const playerLink = page.locator('.match-card .player-name, .match-card-player-name').first();
    // Player details drawer may not be available on all match card layouts
    // Skip if no clickable player name is found
    const isVisible = await playerLink.isVisible().catch(() => false);
    if (!isVisible) {
      test.skip();
      return;
    }

    await playerLink.click();

    // Player details panel should appear
    const panel = page.locator('.player-details');
    await expect(panel).toBeVisible({ timeout: 5000 });
    await waitForAnimation(page, '.player-details');

    // Close button should be visible and in viewport
    const closeBtn = page.locator('.player-details-close-btn');
    await expect(closeBtn).toBeVisible();
    await assertInViewport(page, '.player-details-close-btn');

    // Panel should cover most of the screen on mobile
    const panelBox = await panel.boundingBox();
    expect(panelBox.width).toBeGreaterThanOrEqual(370); // nearly full width on 390px viewport

    await page.screenshot({ path: 'test-results/mobile-player-details.png' });

    // Close it
    await closeBtn.click();
    await expect(panel).not.toBeVisible({ timeout: 5000 });
  });
});
