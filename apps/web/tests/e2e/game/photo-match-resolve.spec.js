import { test, expect } from '../fixtures/test-fixtures.js';
import { execSync } from 'child_process';

/**
 * Photo Match — Unrecognized Player Resolution E2E Tests
 *
 * Tests the flow where AI-extracted player names can't be matched and
 * the user resolves them via the PlayerSearchModal / PlaceholderCreateModal.
 *
 * Only the upload + SSE stream are mocked (Gemini dependency).
 * Player search, placeholder creation, and confirm hit the REAL test backend.
 */

// Minimal valid 1x1 JPEG for file upload
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////' +
  '////////////////////////////////////////////////////////////' +
  '2wBDAf//////////////////////' +
  '////////////////////////////////////////////////////////////' +
  'wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
  'AAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+A/9k=',
  'base64'
);

const TEST_SESSION_ID = 'e2e-photo-resolve-test';
const REDIS_KEY_PREFIX = 'photo_match_session:';

/**
 * Build mock match data using real player IDs for matched players.
 * Two players are matched (from fixture), two are unmatched raw names.
 */
function buildMockMatches(playerIds) {
  const ids = Object.values(playerIds);
  return [
    {
      match_number: 1,
      team1_player1: { id: null, name: 'Unknown Alpha' },
      team1_player1_id: null,
      team1_player1_matched: '',
      team1_player1_confidence: 0,
      team1_player2: { id: ids[0], name: '' },
      team1_player2_id: ids[0],
      team1_player2_matched: Object.keys(playerIds)[0],
      team1_player2_confidence: 1.0,
      team2_player1: { id: ids[1], name: '' },
      team2_player1_id: ids[1],
      team2_player1_matched: Object.keys(playerIds)[1],
      team2_player1_confidence: 1.0,
      team2_player2: { id: null, name: 'Unknown Beta' },
      team2_player2_id: null,
      team2_player2_matched: '',
      team2_player2_confidence: 0,
      team1_score: 21,
      team2_score: 15,
    },
  ];
}

/**
 * Set up route mocks for upload + SSE stream ONLY.
 * Player search, placeholder creation, and confirm hit real API.
 */
async function setupPhotoMatchMocks(page, leagueId, playerIds) {
  const matches = buildMockMatches(playerIds);

  // Mock photo upload — return a fake job/session so we don't call Gemini
  await page.route(`**/api/leagues/${leagueId}/matches/upload-photo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 9999, session_id: TEST_SESSION_ID }),
    });
  });

  // Mock SSE stream — return completed result with unmatched players
  await page.route(`**/api/leagues/${leagueId}/matches/photo-jobs/*/stream`, async (route) => {
    const payload = {
      status: 'COMPLETED',
      result: {
        status: 'needs_clarification',
        matches,
        clarification_question:
          "I couldn't match these player names: Unknown Alpha, Unknown Beta. Please clarify.",
        error_message: null,
        note: null,
      },
    };
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      headers: { 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
      body: `event: done\ndata: ${JSON.stringify(payload)}\n\n`,
    });
  });

  // Mock the cancel/delete endpoint for tests that don't seed a Redis session.
  // The modal's onClose calls DELETE /photo-sessions/{session_id} which would 404
  // without a real Redis session.
  await page.route(`**/api/leagues/${leagueId}/matches/photo-sessions/${TEST_SESSION_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"cancelled"}' });
    } else {
      await route.fallback();
    }
  });
}

/**
 * Seed a Redis session so the real confirm endpoint can read it.
 * Uses redis-cli via docker exec to avoid adding a Redis client dependency.
 */
function seedRedisSession(leagueId, playerIds) {
  const matches = buildMockMatches(playerIds);
  const sessionData = {
    league_id: leagueId,
    parsed_matches: matches,
    status: 'needs_clarification',
    clarification_question:
      "I couldn't match these player names: Unknown Alpha, Unknown Beta. Please clarify.",
  };

  const key = `${REDIS_KEY_PREFIX}${TEST_SESSION_ID}`;
  const value = JSON.stringify(sessionData);
  execSync(
    `docker exec beach-kings-redis-test redis-cli SET '${key}' '${value.replace(/'/g, "'\\''")}' EX 900`,
    { stdio: 'pipe' }
  );
}

/**
 * Navigate to a league, go to Games tab, upload a mock photo, and wait
 * for the review modal with unrecognized players to appear.
 */
async function navigateToPhotoReviewWithUnmatched(page, leagueId) {
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

  // Games tab
  const gamesTab = page.locator('[data-testid="matches-tab"]').first();
  await gamesTab.waitFor({ state: 'visible', timeout: 10000 });
  await gamesTab.click();

  // Upload Photo card
  const uploadCard = page.locator('[data-testid="upload-photo-card"]').first();
  await uploadCard.waitFor({ state: 'visible', timeout: 10000 });
  await uploadCard.click();

  // Wait for upload modal
  await page.waitForSelector('.upload-photo-modal', { state: 'visible', timeout: 10000 });

  // Set file on hidden input
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'scoresheet.jpg',
    mimeType: 'image/jpeg',
    buffer: JPEG_BYTES,
  });

  // Click "Upload & Process" button inside the upload modal
  const uploadButton = page.locator('.upload-photo-modal button:has-text("Upload & Process")');
  await uploadButton.waitFor({ state: 'visible', timeout: 5000 });
  await uploadButton.click();

  // Wait for review modal with unrecognized players
  await page.waitForSelector('.photo-review-modal', { state: 'visible', timeout: 15000 });
  await page.locator('.unrecognized-players').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * From the review modal (with unrecognized players visible), click the first
 * unmatched chip, then click "+ Add New Player" to open PlaceholderCreateModal.
 */
async function openPlaceholderCreateFromUnmatched(page) {
  // Click first unmatched chip
  await page.locator('.unrecognized-players__chip').first().click();
  await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });

  // Click "+ Add New Player"
  await page.locator('.player-search-modal__add-new').click();
  await page.waitForSelector('.placeholder-create-modal', { state: 'visible', timeout: 5000 });
}

/**
 * Resolve the first unmatched chip by searching for a real player from the fixture.
 * Clears the pre-filled search, types the player name prefix, and clicks the result.
 */
async function resolveFirstUnmatchedViaSearch(page, playerNames) {
  // The third player in the fixture (index 2) — not used in matched slots
  const targetName = playerNames[2];
  // Use a short prefix that uniquely matches
  const searchPrefix = targetName.substring(0, 10);

  await page.locator('.unrecognized-players__chip').first().click();
  await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });
  const searchInput = page.locator('.player-search-modal__input');
  await searchInput.clear();
  await searchInput.fill(searchPrefix);
  const result = page.locator(`.player-search-modal__result:has-text("${targetName}")`);
  await result.waitFor({ state: 'visible', timeout: 5000 });
  await result.click();
}

test.describe('Photo Match — Unrecognized Player Resolution', () => {
  test('selecting gender in PlaceholderCreateModal does not close parent modals', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);
    await openPlaceholderCreateFromUnmatched(page);

    // Select a gender — this should NOT close any modals
    const genderSelect = page.locator('.placeholder-create-modal__fields select').first();
    await genderSelect.selectOption({ index: 1 });

    // All three modals should still be visible
    await expect(page.locator('.placeholder-create-modal')).toBeVisible();
    await expect(page.locator('.player-search-modal')).toBeVisible();
    await expect(page.locator('.photo-review-modal')).toBeVisible();
  });

  test('clicking PlaceholderCreateModal overlay closes only that modal', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);
    await openPlaceholderCreateFromUnmatched(page);

    // Click overlay edge (outside the card) to dismiss PlaceholderCreateModal
    const overlay = page.locator('.placeholder-create-modal__overlay');
    const box = await overlay.boundingBox();
    await page.mouse.click(box.x + 5, box.y + 5);

    // Only PlaceholderCreateModal should close
    await expect(page.locator('.placeholder-create-modal')).not.toBeVisible({ timeout: 3000 });
    await expect(page.locator('.player-search-modal')).toBeVisible();
    await expect(page.locator('.photo-review-modal')).toBeVisible();
  });

  test('PlaceholderCreateModal uses current search query as player name', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);

    // Open PlayerSearchModal for "Unknown Alpha"
    await page.locator('.unrecognized-players__chip').first().click();
    await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });

    // Change search query to an updated name
    const searchInput = page.locator('.player-search-modal__input');
    await searchInput.clear();
    await searchInput.fill('Jonathan Doe');
    await page.waitForTimeout(500); // debounce

    // Open PlaceholderCreateModal
    await page.locator('.player-search-modal__add-new').click();
    await page.waitForSelector('.placeholder-create-modal', { state: 'visible', timeout: 5000 });

    // Name input should have the updated query, not original "Unknown Alpha"
    const nameInput = page.locator('.placeholder-create-modal__name');
    await expect(nameInput).toHaveValue('Jonathan Doe');
  });

  test('resolving all unmatched players via search enables confirm button', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds, playerNames } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);

    // Confirm button should be disabled while players are unmatched
    const confirmBtn = page.locator('button:has-text("Confirm & Create")');
    await expect(confirmBtn).toBeDisabled();

    // Resolve first unmatched player ("Unknown Alpha") via real player search
    await resolveFirstUnmatchedViaSearch(page, playerNames);

    // First chip resolved — second chip should still be visible
    await page.locator('.unrecognized-players__chip').first().waitFor({ state: 'visible', timeout: 5000 });
    await expect(confirmBtn).toBeDisabled();

    // Resolve second unmatched player ("Unknown Beta") via search for 4th fixture player
    const fourthName = playerNames[3];
    const searchPrefix = fourthName.substring(0, 10);
    await page.locator('.unrecognized-players__chip').first().click();
    await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });
    const searchInput = page.locator('.player-search-modal__input');
    await searchInput.clear();
    await searchInput.fill(searchPrefix);
    const result = page.locator(`.player-search-modal__result:has-text("${fourthName}")`);
    await result.waitFor({ state: 'visible', timeout: 5000 });
    await result.click();

    // All players resolved — confirm button should be enabled
    await expect(page.locator('.unrecognized-players')).not.toBeVisible({ timeout: 3000 });
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 });
  });

  test('resolving unmatched player via placeholder creation enables confirm button', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds, playerNames } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);

    const confirmBtn = page.locator('button:has-text("Confirm & Create")');
    await expect(confirmBtn).toBeDisabled();

    // Resolve "Unknown Alpha" via real player search
    await resolveFirstUnmatchedViaSearch(page, playerNames);

    // Resolve "Unknown Beta" by creating a new placeholder player (hits real API)
    await page.locator('.unrecognized-players__chip').first().click();
    await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });

    const searchInput = page.locator('.player-search-modal__input');
    await searchInput.clear();
    await searchInput.fill(`E2E Placeholder ${Date.now()}`);
    await page.waitForTimeout(500); // debounce

    await page.locator('.player-search-modal__add-new').click();
    await page.waitForSelector('.placeholder-create-modal', { state: 'visible', timeout: 5000 });

    // Create the placeholder via real API
    await page.locator('.placeholder-create-modal__create-btn').click();

    // Wait for success state, then close
    await page.waitForSelector('.placeholder-create-modal__success', { state: 'visible', timeout: 5000 });
    await page.locator('.placeholder-create-modal__done-btn').click();

    // All players resolved — confirm button should be enabled
    await expect(page.locator('.unrecognized-players')).not.toBeVisible({ timeout: 3000 });
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 });
  });

  test('confirm creates real matches after resolving players via placeholder', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, seasonId, playerIds, playerNames } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId, playerIds);

    // Seed Redis session so the real confirm endpoint can read parsed_matches
    seedRedisSession(leagueId, playerIds);

    await navigateToPhotoReviewWithUnmatched(page, leagueId);

    // Resolve "Unknown Alpha" via real player search
    await resolveFirstUnmatchedViaSearch(page, playerNames);

    // Resolve "Unknown Beta" via real placeholder creation
    await page.locator('.unrecognized-players__chip').first().click();
    await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });
    const searchInput = page.locator('.player-search-modal__input');
    await searchInput.clear();
    await searchInput.fill(`E2E Confirm Test ${Date.now()}`);
    await page.waitForTimeout(500);
    await page.locator('.player-search-modal__add-new').click();
    await page.waitForSelector('.placeholder-create-modal', { state: 'visible', timeout: 5000 });
    await page.locator('.placeholder-create-modal__create-btn').click();
    await page.waitForSelector('.placeholder-create-modal__success', { state: 'visible', timeout: 5000 });
    await page.locator('.placeholder-create-modal__done-btn').click();

    // Select the season
    const seasonSelect = page.locator('.confirmation-options select').first();
    await seasonSelect.waitFor({ state: 'visible', timeout: 5000 });
    await seasonSelect.selectOption({ index: 1 });

    // Listen for the real confirm API call
    const confirmResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/confirm') && resp.request().method() === 'POST',
      { timeout: 15000 }
    );

    // Click confirm
    const confirmBtn = page.locator('button:has-text("Confirm & Create")');
    await expect(confirmBtn).toBeEnabled({ timeout: 3000 });
    await confirmBtn.click();

    // Verify the real confirm API returned success
    const confirmResponse = await confirmResponsePromise;
    const body = await confirmResponse.json();
    expect(confirmResponse.status()).toBe(200);
    expect(body.status).toBe('success');
    expect(body.match_ids.length).toBeGreaterThan(0);
  });
});
