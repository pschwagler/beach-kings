import { test, expect } from '../fixtures/test-fixtures.js';
import { createPickupSession, createTestSession, invitePlayerToSession } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

for (const kind of ['pickup', 'league']) {
  test(`shared ${kind} session is readable anonymously without joining or edits`, async ({ page, testUser, leagueWithPlayers }) => {
    const name = `Shared ${kind} games`;
    const session = kind === 'pickup'
      ? await createPickupSession(testUser.token, { name })
      : await createTestSession(testUser.token, leagueWithPlayers.leagueId, { name });
    const ids = Object.values(leagueWithPlayers.playerIds);
    for (const id of ids) await invitePlayerToSession(testUser.token, session.id, id);
    await createApiClient(testUser.token).post('/api/matches', {
      session_id: session.id,
      ...(kind === 'league' ? { league_id: leagueWithPlayers.leagueId, season_id: leagueWithPlayers.seasonId } : {}),
      team1_player1_id: ids[0], team1_player2_id: ids[1],
      team2_player1_id: ids[2], team2_player2_id: ids[3],
      team1_score: 21, team2_score: 18,
    });
    const writes = [];
    page.on('request', request => {
      if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.goto(`/session/${session.code}`);
    await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Shared session · Read only')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    for (const playerName of leagueWithPlayers.playerNames) {
      await expect(page.getByRole('region', { name: 'Session players' })).toContainText(playerName);
    }
    await expect(page.locator('.match-card')).toHaveCount(1);
    await expect(page.locator('.match-card')).toContainText('21');
    await expect(page.locator('.match-card')).toContainText('18');
    await expect(page.getByRole('button', { name: /Manage session|Add New Match|Submit|Delete Session|Leave Session/i })).toHaveCount(0);
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.clipboard-table')).toContainText('21');
    await expect(page.locator('.clipboard-table')).toContainText('18');
    await page.getByRole('button', { name: 'Cards', exact: true }).click();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.locator('.auth-modal')).toBeVisible();
    await expect(page.locator('.auth-modal button[type="submit"]')).toHaveText('Log In');
    await page.locator('.auth-modal__close').click();
    await page.getByRole('button', { name: 'Sign up', exact: true }).click();
    await expect(page.locator('.auth-modal')).toBeVisible();
    await expect(page.locator('.auth-modal__header h2')).toContainText(/sign up|create/i);
  });
}

test('invalid shared session retains navigation and offers authentication', async ({ page }) => {
  await page.goto('/session/INVALID-NOT-A-CODE');
  await expect(page.locator('.shared-session-preview [role="alert"]')).toContainText(/not found/i);
  await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
});
