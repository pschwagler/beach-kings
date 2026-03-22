import { test, expect } from '../fixtures/test-fixtures.js';
import { execSync } from 'child_process';

/**
 * Share Modal Personalization E2E Tests
 *
 * Verifies that when sharing an invite for a newly created placeholder
 * player, the share fallback modal (desktop) header includes the player's name.
 *
 * Uses the photo match flow where a placeholder is created during player
 * resolution, then the "Share Invite" button is clicked.
 */

// Minimal valid 1x1 JPEG
const JPEG_BYTES = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////' +
  '////////////////////////////////////////////////////////////' +
  '2wBDAf//////////////////////' +
  '////////////////////////////////////////////////////////////' +
  'wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAA' +
  'AAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+A/9k=',
  'base64'
);

const TEST_SESSION_ID = 'e2e-share-modal-test';
const REDIS_KEY_PREFIX = 'photo_match_session:';

function buildMockMatches(playerIds) {
  const ids = Object.values(playerIds);
  return [
    {
      match_number: 1,
      team1_player1: { id: null, name: 'Share Test Player' },
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
      team2_player2: { id: ids[2], name: '' },
      team2_player2_id: ids[2],
      team2_player2_matched: Object.keys(playerIds)[2],
      team2_player2_confidence: 1.0,
      team1_score: 21,
      team2_score: 15,
    },
  ];
}

async function setupPhotoMocks(page, leagueId, playerIds) {
  const matches = buildMockMatches(playerIds);

  await page.route(`**/api/leagues/${leagueId}/matches/upload-photo`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job_id: 9997, session_id: TEST_SESSION_ID }),
    });
  });

  await page.route(`**/api/leagues/${leagueId}/matches/photo-jobs/*/stream`, async (route) => {
    const payload = {
      status: 'COMPLETED',
      result: {
        status: 'needs_clarification',
        matches,
        clarification_question: "I couldn't match: Share Test Player.",
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

  await page.route(`**/api/leagues/${leagueId}/matches/photo-sessions/${TEST_SESSION_ID}`, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"cancelled"}' });
    } else {
      await route.fallback();
    }
  });
}

test.describe('Share Modal — Player Name', () => {
  test('share fallback modal displays the player name in the header', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const page = authedPage;
    const { leagueId, playerIds } = leagueWithPlayers;

    await setupPhotoMocks(page, leagueId, playerIds);

    // Navigate to league, Games tab, upload photo
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

    const uploadCard = page.locator('[data-testid="upload-photo-card"]').first();
    await uploadCard.waitFor({ state: 'visible', timeout: 10000 });
    await uploadCard.click();

    await page.waitForSelector('.upload-photo-modal', { state: 'visible', timeout: 10000 });
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'scoresheet.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_BYTES,
    });
    const uploadBtn = page.locator('.upload-photo-modal button:has-text("Upload & Process")');
    await uploadBtn.waitFor({ state: 'visible', timeout: 5000 });
    await uploadBtn.click();

    // Wait for review modal with unrecognized player
    await page.waitForSelector('.photo-review-modal', { state: 'visible', timeout: 15000 });
    await page.locator('.unrecognized-players').waitFor({ state: 'visible', timeout: 10000 });

    // Click the unmatched chip to open PlayerSearchModal
    await page.locator('.unrecognized-players__chip').first().click();
    await page.waitForSelector('.player-search-modal', { state: 'visible', timeout: 5000 });

    // Click "+ Add New Player" to open PlaceholderCreateModal
    await page.locator('.player-search-modal__add-new').click();
    await page.waitForSelector('.placeholder-create-modal', { state: 'visible', timeout: 5000 });

    // The name should be pre-filled with "Share Test Player"
    const nameInput = page.locator('.placeholder-create-modal__name');
    const playerName = await nameInput.inputValue();

    // Create the placeholder via real API
    await page.locator('.placeholder-create-modal__create-btn').click();
    await page.waitForSelector('.placeholder-create-modal__success', { state: 'visible', timeout: 5000 });

    // Click "Share Invite" — on desktop, this opens the ShareFallbackModal
    await page.locator('.placeholder-create-modal__share-btn').click();

    // Wait for share fallback modal
    const shareModal = page.locator('.share-fallback');
    await shareModal.waitFor({ state: 'visible', timeout: 5000 });

    // Verify the header includes the player's name
    const header = shareModal.locator('.share-fallback__header span').first();
    await expect(header).toContainText('Share Invite for');
    await expect(header).toContainText(playerName);
  });
});
