import { test, expect } from '../fixtures/test-fixtures.js';
import { execSync } from 'child_process';

/**
 * Photo Match — Data Refresh After Confirm E2E Test
 *
 * Verifies that after confirming photo-extracted matches, the new matches
 * appear in the Games tab without requiring a manual page refresh.
 *
 * Upload + SSE are mocked (Gemini dependency). The confirm endpoint hits
 * the real backend with a seeded Redis session.
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

const TEST_SESSION_ID = 'e2e-photo-refresh-test';
const REDIS_KEY_PREFIX = 'photo_match_session:';

/**
 * Build mock matches where all 4 players are matched (no unresolved names).
 * This lets us go straight to confirm without needing player resolution.
 */
function buildFullyMatchedMatches(playerIds, playerNames) {
  const names = Object.keys(playerIds);
  const ids = Object.values(playerIds);
  return [
    {
      match_number: 1,
      team1_player1: { id: ids[0], name: names[0] },
      team1_player1_id: ids[0],
      team1_player1_matched: names[0],
      team1_player1_confidence: 1.0,
      team1_player2: { id: ids[1], name: names[1] },
      team1_player2_id: ids[1],
      team1_player2_matched: names[1],
      team1_player2_confidence: 1.0,
      team2_player1: { id: ids[2], name: names[2] },
      team2_player1_id: ids[2],
      team2_player1_matched: names[2],
      team2_player1_confidence: 1.0,
      team2_player2: { id: ids[3], name: names[3] },
      team2_player2_id: ids[3],
      team2_player2_matched: names[3],
      team2_player2_confidence: 1.0,
      team1_score: 21,
      team2_score: 17,
    },
  ];
}

function seedRedisSession(leagueId, playerIds, playerNames) {
  const matches = buildFullyMatchedMatches(playerIds, playerNames);
  const sessionData = {
    league_id: leagueId,
    parsed_matches: matches,
    status: 'done',
  };

  const key = `${REDIS_KEY_PREFIX}${TEST_SESSION_ID}`;
  const value = JSON.stringify(sessionData);
  execSync(
    `docker exec beach-kings-redis-test redis-cli SET '${key}' '${value.replace(/'/g, "'\\''")}' EX 900`,
    { stdio: 'pipe' }
  );
}

async function setupFullyMatchedMocks(page, leagueId, playerIds, playerNames) {
  const matches = buildFullyMatchedMatches(playerIds, playerNames);

  // Mock photo upload
  await page.route(`**/api/leagues/${leagueId}/matches/upload-photo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 9998, session_id: TEST_SESSION_ID }),
    });
  });

  // Mock SSE stream — all players matched, ready to confirm
  await page.route(`**/api/leagues/${leagueId}/matches/photo-jobs/*/stream`, async (route) => {
    const payload = {
      status: 'COMPLETED',
      result: {
        status: 'done',
        matches,
        clarification_question: null,
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

  // Mock delete endpoint
  await page.route(`**/api/leagues/${leagueId}/matches/photo-sessions/${TEST_SESSION_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"cancelled"}' });
    } else {
      await route.fallback();
    }
  });
}

test.describe('Photo Match — Data Refresh After Confirm', () => {
  test('confirmed photo matches appear in the active session without page reload', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, seasonId, playerIds, playerNames } = leagueWithPlayers;

    // Seed Redis session for the real confirm endpoint
    seedRedisSession(leagueId, playerIds, playerNames);
    await setupFullyMatchedMocks(page, leagueId, playerIds, playerNames);

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

    const gamesTab = page.locator('[data-testid="matches-tab"]').first();
    await gamesTab.waitFor({ state: 'visible', timeout: 10000 });
    await gamesTab.click();

    // Verify no active session yet
    await expect(page.locator('[data-testid="active-session"]')).not.toBeVisible({ timeout: 5000 });

    // Click "Upload Photo" card
    const uploadCard = page.locator('[data-testid="upload-photo-card"]').first();
    await uploadCard.waitFor({ state: 'visible', timeout: 10000 });
    await uploadCard.click();

    // Wait for upload modal, set file, click upload
    await page.waitForSelector('.upload-photo-modal', { state: 'visible', timeout: 10000 });
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'scoresheet.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_BYTES,
    });
    const uploadButton = page.locator('.upload-photo-modal button:has-text("Upload & Process")');
    await uploadButton.waitFor({ state: 'visible', timeout: 5000 });
    await uploadButton.click();

    // Wait for review modal
    await page.waitForSelector('.photo-review-modal', { state: 'visible', timeout: 15000 });

    // All players matched — no unrecognized section should appear
    await expect(page.locator('.unrecognized-players')).not.toBeVisible({ timeout: 3000 });

    // Select the season
    const seasonSelect = page.locator('.confirmation-options select').first();
    await seasonSelect.waitFor({ state: 'visible', timeout: 5000 });
    await seasonSelect.selectOption(String(seasonId));

    // Listen for the real confirm API call
    const confirmResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/confirm') && resp.request().method() === 'POST',
      { timeout: 15000 }
    );

    // Click confirm
    const confirmBtn = page.locator('button:has-text("Confirm & Create")');
    await expect(confirmBtn).toBeEnabled({ timeout: 5000 });
    await confirmBtn.click();

    // Verify the real confirm API returned success
    const confirmResponse = await confirmResponsePromise;
    expect(confirmResponse.status()).toBe(200);
    const body = await confirmResponse.json();
    expect(body.match_ids.length).toBeGreaterThan(0);

    // KEY ASSERTION: After the modal closes and data refreshes,
    // the active session with matches should be visible WITHOUT a page reload.
    // Wait for the review modal to close
    await expect(page.locator('.photo-review-modal')).not.toBeVisible({ timeout: 10000 });

    // The active session panel should appear with the new match(es)
    const activeSession = page.locator('[data-testid="active-session"]');
    await activeSession.waitFor({ state: 'visible', timeout: 15000 });

    // Verify match cards are visible in the active session
    const matchCards = activeSession.locator('.match-card, [class*="match-card"]');
    await expect(matchCards.first()).toBeVisible({ timeout: 10000 });
    const matchCount = await matchCards.count();
    expect(matchCount).toBeGreaterThanOrEqual(1);
  });
});
