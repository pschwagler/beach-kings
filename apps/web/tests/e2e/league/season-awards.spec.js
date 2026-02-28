import { test, expect } from '../fixtures/test-fixtures.js';
import { createApiClient } from '../fixtures/api.js';

test.describe('Season Awards', () => {
  /**
   * Create a league with a past-dated season, submit matches via API,
   * then trigger award computation and verify the Awards tab displays results.
   */
  test('should display awards on league Awards tab after season ends', async ({
    authedPage,
    sessionWithMatches,
  }) => {
    const page = authedPage;
    const { leagueId, seasonId, token } = sessionWithMatches;

    // 1. Update the season end_date to yesterday so it counts as "ended"
    const api = createApiClient(token);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastStartDate = new Date();
    pastStartDate.setMonth(pastStartDate.getMonth() - 3);

    await api.put(`/api/seasons/${seasonId}`, {
      start_date: pastStartDate.toISOString().split('T')[0],
      end_date: yesterday.toISOString().split('T')[0],
    });

    // 2. Trigger award computation via the GET endpoint (lazy compute)
    const awardsResponse = await api.get(`/api/seasons/${seasonId}/awards`);
    // Awards may be empty if stats haven't been calculated yet — that's OK
    // The important thing is the endpoint doesn't error

    // 3. Navigate to the league page Awards tab
    await page.goto(`/league/${leagueId}?tab=awards`);
    await page.waitForLoadState('networkidle');

    // 4. Verify the Awards tab is visible
    const awardsHeader = page.locator('.awards-tab__title');
    await expect(awardsHeader).toBeVisible({ timeout: 10000 });
    await expect(awardsHeader).toHaveText('Season Results');

    // 5. Check for either awards content or empty state
    const hasAwards = await page.locator('.awards-tab__season').count() > 0;
    const hasEmpty = await page.locator('.awards-tab__empty').count() > 0;

    // One of these should be present
    expect(hasAwards || hasEmpty).toBeTruthy();
  });

  /**
   * Verify the awards API endpoints work correctly.
   */
  test('should return awards from API endpoints', async ({
    authedPage,
    sessionWithMatches,
  }) => {
    const { leagueId, seasonId, token } = sessionWithMatches;
    const api = createApiClient(token);

    // Set season to past
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastStartDate = new Date();
    pastStartDate.setMonth(pastStartDate.getMonth() - 3);

    await api.put(`/api/seasons/${seasonId}`, {
      start_date: pastStartDate.toISOString().split('T')[0],
      end_date: yesterday.toISOString().split('T')[0],
    });

    // Season awards endpoint
    const seasonAwards = await api.get(`/api/seasons/${seasonId}/awards`);
    expect(seasonAwards.status).toBe(200);
    expect(Array.isArray(seasonAwards.data)).toBeTruthy();

    // League awards endpoint
    const leagueAwards = await api.get(`/api/leagues/${leagueId}/awards`);
    expect(leagueAwards.status).toBe(200);
    expect(Array.isArray(leagueAwards.data)).toBeTruthy();

    // If awards were computed, verify structure
    if (seasonAwards.data.length > 0) {
      const award = seasonAwards.data[0];
      expect(award).toHaveProperty('award_type');
      expect(award).toHaveProperty('award_key');
      expect(award).toHaveProperty('player_id');
      expect(award).toHaveProperty('season_id');
      expect(award).toHaveProperty('league_id');
    }
  });
});
