import { test, expect } from '../fixtures/test-fixtures.js';
import { SessionPage } from '../pages/SessionPage.js';
import {
  createPickupSession,
  invitePlayerToSession,
} from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * Helper: create a submitted pickup session with 1 match.
 * Returns { session, playerIds, api }.
 */
async function createSubmittedSession(token) {
  const api = createApiClient(token);
  const ts = Date.now();
  const playerNames = [
    `Del A ${ts}`, `Del B ${ts}`, `Del C ${ts}`, `Del D ${ts}`,
  ];
  const playerIds = [];
  for (const name of playerNames) {
    const resp = await api.post('/api/players', { name });
    playerIds.push(resp.data.player_id);
  }

  const session = await createPickupSession(token, { name: `Delete Test ${ts}` });
  for (const id of playerIds) {
    await invitePlayerToSession(token, session.id, id);
  }

  await api.post('/api/matches', {
    session_id: session.id,
    team1_player1_id: playerIds[0],
    team1_player2_id: playerIds[1],
    team2_player1_id: playerIds[2],
    team2_player2_id: playerIds[3],
    team1_score: 21,
    team2_score: 15,
  });

  // Submit (lock in) so session is no longer ACTIVE
  await api.patch(`/api/sessions/${session.id}`, { submit: true });

  return { session, playerIds, api };
}

test.describe('Pickup Session Deletion', () => {
  test('should delete a submitted session via UI', async ({ authedPage, testUser }) => {
    const page = authedPage;
    const sessionPage = new SessionPage(page);
    const { session } = await createSubmittedSession(testUser.token);

    // Navigate to the session
    await sessionPage.goto(session.code);
    await sessionPage.waitForReady();

    // Session should show "Session has ended"
    await expect(page.locator('.session-ended-label')).toBeVisible({ timeout: 5000 });

    // Delete via the SessionPage POM (clicks Delete Session link + confirms)
    await sessionPage.deleteSession();

    // Should redirect to home
    await expect(page).toHaveURL(/\/home/, { timeout: 10000 });

    // Verify session is gone: navigating back shows error / not found
    await page.goto(`/session/${session.code}`);
    await page.waitForSelector('.session-page', { timeout: 15000 });
    await expect(page.locator('.session-page-error')).toBeVisible({ timeout: 10000 });
  });

  test('should delete a submitted session via API', async ({ testUser }) => {
    const { session, api } = await createSubmittedSession(testUser.token);

    // Delete via API (this was previously returning 400)
    const deleteResp = await api.delete(`/api/sessions/${session.id}`);
    expect(deleteResp.status).toBe(200);
    expect(deleteResp.data.status).toBe('success');

    // Verify session no longer exists: deleting again returns 404
    const again = await api.delete(`/api/sessions/${session.id}`).catch(e => e.response);
    expect(again.status).toBe(404);
  });

  test('should delete an active (not yet submitted) session via API', async ({ testUser }) => {
    const api = createApiClient(testUser.token);
    const session = await createPickupSession(testUser.token, { name: `Active Del ${Date.now()}` });

    // Delete while still ACTIVE
    const deleteResp = await api.delete(`/api/sessions/${session.id}`);
    expect(deleteResp.status).toBe(200);

    // Verify gone: deleting again returns 404
    const again = await api.delete(`/api/sessions/${session.id}`).catch(e => e.response);
    expect(again.status).toBe(404);
  });
});
