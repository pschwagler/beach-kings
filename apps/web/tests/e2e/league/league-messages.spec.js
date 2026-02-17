import { test, expect } from '../fixtures/test-fixtures.js';
import { createTestLeague } from '../utils/test-helpers.js';
import { createApiClient } from '../fixtures/api.js';

/**
 * E2E tests for league messages.
 *
 * Uses `testUser` (league admin) + `authedPage`.
 * Messages are on the league's Messages tab.
 */

test.describe('League Messages', () => {
  test('post a message', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create a league
    const league = await createTestLeague(testUser.token, {
      name: `Messages League ${Date.now()}`,
    });

    // Navigate to Messages tab
    await page.goto(`/league/${league.id}?tab=messages`);
    await page.waitForSelector('[data-testid="messages-tab"]', { timeout: 15000 });

    // Message input should be visible
    const messageInput = page.locator('textarea.league-messages-input');
    await expect(messageInput).toBeVisible({ timeout: 10000 });

    // Type a message
    const messageText = `Test message ${Date.now()}`;
    await messageInput.fill(messageText);

    // Click Send
    const sendBtn = page.locator('button.league-messages-send-btn');
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // Message should appear in the list
    const messageItem = page.locator('.league-message-item');
    await expect(messageItem.first()).toBeVisible({ timeout: 10000 });
    await expect(messageItem.first().locator('.league-message-content'))
      .toContainText(messageText);

    // Author name should be visible
    await expect(messageItem.first().locator('.league-message-player'))
      .toContainText(testUser.fullName);
  });

  test('view existing messages', async ({ authedPage, testUser }) => {
    const page = authedPage;

    // Create a league and seed messages via API
    const league = await createTestLeague(testUser.token, {
      name: `View Messages League ${Date.now()}`,
    });

    const api = createApiClient(testUser.token);
    await api.post(`/api/leagues/${league.id}/messages`, {
      message: 'First message from API',
    });
    await api.post(`/api/leagues/${league.id}/messages`, {
      message: 'Second message from API',
    });

    // Navigate to Messages tab
    await page.goto(`/league/${league.id}?tab=messages`);
    await page.waitForSelector('[data-testid="messages-tab"]', { timeout: 15000 });

    // Messages should be visible
    const messageItems = page.locator('.league-message-item');
    await expect(messageItems.first()).toBeVisible({ timeout: 10000 });

    // Should show both messages
    await expect(messageItems).toHaveCount(2, { timeout: 10000 });
  });
});
