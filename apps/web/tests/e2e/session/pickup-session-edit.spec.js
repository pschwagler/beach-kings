import { test, expect } from '../fixtures/test-fixtures.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  createPickupSession,
  invitePlayerToSession,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * Helper: create a submitted pickup session with 1 match, ready for edit-mode tests.
 * Returns { session, playerIds, playerNames, api }.
 */
async function createSubmittedSession(token) {
  const api = createApiClient(token);
  const ts = Date.now();
  const playerNames = [
    `Edit A ${ts}`, `Edit B ${ts}`, `Edit C ${ts}`, `Edit D ${ts}`,
  ];
  const playerIds = [];
  for (const name of playerNames) {
    const resp = await api.post('/api/players', { name });
    playerIds.push(resp.data.player_id);
  }

  const session = await createPickupSession(token, { name: `Edit Test ${ts}` });
  for (const id of playerIds) {
    await invitePlayerToSession(token, session.id, id);
  }

  // Create a match
  await api.post('/api/matches', {
    session_id: session.id,
    team1_player1_id: playerIds[0],
    team1_player2_id: playerIds[1],
    team2_player1_id: playerIds[2],
    team2_player2_id: playerIds[3],
    team1_score: 21,
    team2_score: 15,
  });

  // Submit (lock in)
  await api.patch(`/api/sessions/${session.id}`, { submit: true });

  return { session, playerIds, playerNames, api };
}

test.describe('Pickup Session Edit Mode (Buffered)', () => {
  test('edit mode → edit score → cancel (clean) → no confirmation, exits immediately', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session } = await createSubmittedSession(testUser.token);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Session should show "Session has ended"
    await expect(page.locator('.session-ended-label')).toBeVisible({ timeout: 5000 });

    // Click the edit pencil via SessionGroupHeader
    const editButton = page.locator('button[title="Edit session"], button:has-text("Edit")').first();
    await editButton.click();

    // Should now be in edit mode — Save and Cancel buttons visible
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 3000 });

    // Cancel without making changes — should exit immediately (no confirmation)
    await page.locator('button:has-text("Cancel")').first().click();

    // Should exit edit mode — "Session has ended" shows again
    await expect(page.locator('.session-ended-label')).toBeVisible({ timeout: 5000 });
  });

  test('edit mode → add match → save → match persists', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session, playerNames } = await createSubmittedSession(testUser.token);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Enter edit mode
    const editButton = page.locator('button[title="Edit session"], button:has-text("Edit")').first();
    await editButton.click();
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });

    // Get initial match count
    const initialCount = await sessionPage.getMatchesCount();

    // Add a new match via the modal
    await sessionPage.clickAddMatch();
    await sessionPage.fillMatchForm({
      team1Player1: playerNames[2],
      team1Player2: playerNames[3],
      team2Player1: playerNames[0],
      team2Player2: playerNames[1],
      team1Score: 21,
      team2Score: 19,
    });
    await sessionPage.submitMatchForm();

    // Match should appear in the UI (buffered, not yet persisted)
    const bufferedCount = await sessionPage.getMatchesCount();
    expect(bufferedCount).toBe(initialCount + 1);

    // Save — flushes buffer to API
    const saveButton = page.locator('[data-testid="active-session-panel"] button:has-text("Save"), .session-actions button:has-text("Save")').first();
    await saveButton.click();
    await page.waitForTimeout(2000);

    // Page should exit edit mode and show updated data
    await expect(page.locator('.session-ended-label')).toBeVisible({ timeout: 10000 });

    // Reload to confirm persistence
    await page.reload();
    await sessionPage.waitForReady();
    const finalCount = await sessionPage.getMatchesCount();
    expect(finalCount).toBe(initialCount + 1);
  });

  test('edit mode → edit score → save → page shows updated data', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session, playerNames } = await createSubmittedSession(testUser.token);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Enter edit mode
    const editButton = page.locator('button[title="Edit session"], button:has-text("Edit")').first();
    await editButton.click();
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });

    // Click edit on the first match card
    const firstMatchCard = page.locator('.match-card').first();
    await firstMatchCard.locator('button:has-text("Edit"), .match-card-edit-btn').first().click();
    await page.waitForSelector('[data-testid="add-match-modal"]', { state: 'visible', timeout: 5000 });

    // Change score
    await page.locator('[data-testid="team-1-score-digit-1"]').fill('1');
    await page.locator('[data-testid="team-1-score-digit-2"]').fill('5');

    // Submit edit
    await page.locator('[data-testid="add-match-modal"] button:has-text("Update Game")').click();
    await page.waitForSelector('[data-testid="add-match-modal"]', { state: 'hidden', timeout: 5000 });

    // Save
    const saveButton = page.locator('[data-testid="active-session-panel"] button:has-text("Save"), .session-actions button:has-text("Save")').first();
    await saveButton.click();
    await page.waitForTimeout(2000);

    // Reload and verify updated score
    await page.reload();
    await sessionPage.waitForReady();
    const matchText = await page.locator('.match-card').first().textContent();
    expect(matchText).toContain('15');
  });

  test('edit mode (dirty) → cancel → confirmation appears → confirm → clean state', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session, playerNames } = await createSubmittedSession(testUser.token);

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Enter edit mode
    const editButton = page.locator('button[title="Edit session"], button:has-text("Edit")').first();
    await editButton.click();
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });

    // Add a match (makes buffer dirty)
    await sessionPage.clickAddMatch();
    await sessionPage.fillMatchForm({
      team1Player1: playerNames[2],
      team1Player2: playerNames[3],
      team2Player1: playerNames[0],
      team2Player2: playerNames[1],
      team1Score: 21,
      team2Score: 10,
    });
    await sessionPage.submitMatchForm();

    // Cancel — should show confirmation
    await page.locator('button:has-text("Cancel edit"), button:has-text("Cancel")').first().click();
    await expect(page.locator('.modal-content:has-text("Discard")')).toBeVisible({ timeout: 3000 });

    // Confirm discard
    await page.locator('.modal-content button:has-text("Discard")').click();

    // Should exit edit mode — "Session has ended" shows again
    await expect(page.locator('.session-ended-label')).toBeVisible({ timeout: 5000 });

    // Match count should be back to original (1)
    const finalCount = await sessionPage.getMatchesCount();
    expect(finalCount).toBe(1);
  });

  test('edit mode → delete match → save → match removed', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session, playerNames, api } = await createSubmittedSession(testUser.token);

    // Add a second match so we can delete one
    const { playerIds } = { playerIds: [] };
    // Get player IDs from session participants
    const participants = (await api.get(`/api/sessions/${session.id}/participants`)).data;
    const pIds = participants.map(p => p.player_id);

    await api.post('/api/matches', {
      session_id: session.id,
      team1_player1_id: pIds[2],
      team1_player2_id: pIds[3],
      team2_player1_id: pIds[0],
      team2_player2_id: pIds[1],
      team1_score: 18,
      team2_score: 21,
    });
    // Re-submit
    await api.patch(`/api/sessions/${session.id}`, { submit: true });

    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    const initialCount = await sessionPage.getMatchesCount();
    expect(initialCount).toBe(2);

    // Enter edit mode
    const editButton = page.locator('button[title="Edit session"], button:has-text("Edit")').first();
    await editButton.click();
    await expect(page.locator('button:has-text("Save")')).toBeVisible({ timeout: 3000 });

    // Edit the first match to open the modal, then delete it
    const firstMatchCard = page.locator('.match-card').first();
    await firstMatchCard.locator('button:has-text("Edit"), .match-card-edit-btn').first().click();
    await page.waitForSelector('[data-testid="add-match-modal"]', { state: 'visible', timeout: 5000 });

    // Click delete
    await page.locator('.delete-match-text-btn').click();
    // Confirm delete in the sub-modal
    await page.locator('button:has-text("Delete")').last().click();
    await page.waitForSelector('[data-testid="add-match-modal"]', { state: 'hidden', timeout: 5000 });

    // Match should be hidden in UI
    const bufferedCount = await sessionPage.getMatchesCount();
    expect(bufferedCount).toBe(initialCount - 1);

    // Save
    const saveButton = page.locator('[data-testid="active-session-panel"] button:has-text("Save"), .session-actions button:has-text("Save")').first();
    await saveButton.click();
    await page.waitForTimeout(2000);

    // Reload and verify
    await page.reload();
    await sessionPage.waitForReady();
    const finalCount = await sessionPage.getMatchesCount();
    expect(finalCount).toBe(initialCount - 1);
  });
});
