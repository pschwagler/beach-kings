import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';

test.describe('KOB tournament journeys @p1', () => {
  test('director creates, rosters, starts, and opens the public live view', async ({
    authedPage,
    testUser,
    leagueWithPlayers,
  }) => {
    const name = `E2E KOB ${Date.now()}`;
    await authedPage.goto('/kob/create');
    await expect(authedPage.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await authedPage.getByPlaceholder('e.g. Saturday KOB').fill(name);
    await authedPage.getByRole('button', { name: 'Create Tournament' }).click();
    await expect(authedPage).toHaveURL(/\/kob\/manage\/\d+/, { timeout: 15_000 });

    const tournamentId = Number(new URL(authedPage.url()).pathname.split('/').pop());
    const api = createApiClient(testUser.token);
    for (const playerId of Object.values(leagueWithPlayers.playerIds)) {
      await api.post(`/api/kob/tournaments/${tournamentId}/players`, { player_id: playerId });
    }

    await authedPage.reload();
    await expect(authedPage.getByRole('heading', { name: name })).toBeVisible();
    await expect(authedPage.getByRole('heading', { name: 'Players (4)' })).toBeVisible();

    authedPage.once('dialog', (dialog) => dialog.accept());
    await authedPage.getByRole('button', { name: /Start Tournament/ }).click();
    await expect(authedPage).toHaveURL(/\/kob\/[A-Z0-9]+/, { timeout: 15_000 });
    await expect(authedPage.getByRole('heading', { name })).toBeVisible();
    for (const tab of ['Now Playing', 'Standings', 'Schedule']) {
      await authedPage.getByRole('button', { name: tab }).click();
    }
  });

  test('invalid public code resolves to an explicit error with Navbar @smoke @p0', async ({ page }) => {
    await page.goto('/kob/NOTREAL');
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tournament Not Found' })).toBeVisible({ timeout: 15_000 });
  });

  test('anonymous manage route is guarded and malformed IDs do not hang @policy', async ({ page }) => {
    await page.goto('/kob/manage/not-a-number');
    await expect(page.getByRole('navigation', { name: 'Site navigation' })).toBeVisible();
    await expect(page.getByText('Sign in to manage tournaments')).toBeVisible({ timeout: 15_000 });
  });
});
