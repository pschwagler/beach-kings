import { test, expect } from '../fixtures/test-fixtures.js';

/**
 * Photo Match — Unrecognized Player Resolution E2E Tests
 *
 * Tests the flow where AI-extracted player names can't be matched and
 * the user resolves them via the PlayerSearchModal / PlaceholderCreateModal.
 *
 * Uses route interception to mock the photo upload + SSE stream, avoiding
 * real AI processing while exercising the full modal interaction chain.
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

/**
 * Build mock match data with 2 matched and 2 unmatched players.
 */
function buildMockMatchesWithUnmatched() {
  return [
    {
      match_number: 1,
      team1_player1: { id: null, name: 'JD' },
      team1_player1_id: null,
      team1_player1_matched: '',
      team1_player1_confidence: 0,
      team1_player2: { id: 101, name: '' },
      team1_player2_id: 101,
      team1_player2_matched: 'Jane Smith',
      team1_player2_confidence: 1.0,
      team2_player1: { id: 102, name: '' },
      team2_player1_id: 102,
      team2_player1_matched: 'Bob Wilson',
      team2_player1_confidence: 1.0,
      team2_player2: { id: null, name: 'Mike S' },
      team2_player2_id: null,
      team2_player2_matched: '',
      team2_player2_confidence: 0,
      team1_score: 21,
      team2_score: 15,
    },
  ];
}

/**
 * Set up all route mocks needed for the photo match review flow.
 */
async function setupPhotoMatchMocks(page, leagueId) {
  const matches = buildMockMatchesWithUnmatched();

  // Mock photo upload
  await page.route(`**/api/leagues/${leagueId}/matches/upload-photo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 9999, session_id: 'test-session-123' }),
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
          "I couldn't match these player names: JD, Mike S. Please clarify.",
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

  // Mock player search
  await page.route('**/api/players?*', async (route, request) => {
    const url = new URL(request.url());
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const allPlayers = [
      { player_id: 201, name: 'John Doe', gender: 'male', location_name: 'San Diego', elo_rating: 1450 },
      { player_id: 202, name: 'John Davis', gender: 'male', location_name: 'Los Angeles', elo_rating: 1300 },
      { player_id: 203, name: 'Mike Sullivan', gender: 'male', location_name: 'San Diego', elo_rating: 1200 },
    ];
    const filtered = q ? allPlayers.filter((p) => p.name.toLowerCase().includes(q)) : allPlayers;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ players: filtered, total: filtered.length }),
    });
  });

  // Mock placeholder creation
  await page.route('**/api/players/placeholder', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        player_id: 999,
        name: body.name || 'New Player',
        invite_url: 'https://example.com/invite/abc123',
        invite_token: 'abc123',
      }),
    });
  });

  // Mock confirm
  await page.route(`**/api/leagues/${leagueId}/matches/photo-sessions/*/confirm`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'success',
        message: 'Created 1 matches',
        matches_created: 1,
        match_ids: [5001],
      }),
    });
  });
}

/**
 * Navigate to a league, go to Games tab, upload a mock photo, and wait
 * for the review modal with unrecognized players to appear.
 * Returns once the unrecognized players section is visible.
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

test.describe('Photo Match — Unrecognized Player Resolution', () => {
  test('selecting gender in PlaceholderCreateModal does not close parent modals', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId);
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
    const { leagueId } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId);
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
    const { leagueId } = leagueWithPlayers;

    await setupPhotoMatchMocks(page, leagueId);
    await navigateToPhotoReviewWithUnmatched(page, leagueId);

    // Open PlayerSearchModal for "JD"
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

    // Name input should have the updated query, not original "JD"
    const nameInput = page.locator('.placeholder-create-modal__name');
    await expect(nameInput).toHaveValue('Jonathan Doe');
  });
});
