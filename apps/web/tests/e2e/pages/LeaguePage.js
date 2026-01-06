import { BasePage } from './BasePage.js';

/**
 * Page Object Model for League Page
 */
export class LeaguePage extends BasePage {
  constructor(page) {
    super(page);
    // Selectors - prioritize data-testid attributes for stability, with CSS class fallbacks
    this.selectors = {
      // Tabs (IDs match LeagueMenuBar item.id values)
      leaderboardTab: '[data-testid="rankings-tab"], button:has-text("Leaderboard")',
      gamesTab: '[data-testid="matches-tab"], button:has-text("Games")',
      signUpsTab: '[data-testid="signups-tab"], button:has-text("Sign Ups")',
      detailsTab: '[data-testid="details-tab"], button:has-text("Details")',
      messagesTab: '[data-testid="messages-tab"], button:has-text("Messages")',
      
      // Leaderboard/Rankings
      rankingsTable: '[data-testid="rankings-table"], .rankings-table-modern, .rankings-table',
      rankingsRow: '[data-testid="rankings-row"], .rankings-row',
      playerRow: '[data-testid="rankings-row"], .rankings-row',
      seasonSelector: '[data-testid="season-select"], #season-select, select[id*="season-select"]',
      seasonSelectorMatches: '[data-testid="season-select-matches"], #season-select-matches',
      playerSearchInput: '#rankings-player-search, input[placeholder*="Search Player"]',
      
      // Player Details Drawer
      playerDetailsDrawer: '[data-testid="player-details-drawer"], .player-details-drawer',
      playerDetailsCloseButton: '[data-testid="player-details-close"], .player-details-drawer__close, button[aria-label="Close"]',
      
      // Games/Matches
      matchesTable: '[data-testid="matches-table"], .matches-table',
      // First match button (creates session) - no active session yet
      addFirstGameButton: '[data-testid="add-matches-card"], .add-matches-card, button.add-matches-card',
      // Add match button (when session already exists)
      addGameButton: '[data-testid="session-btn-add"], .session-btn.session-btn-add',
      submitSessionButton: '[data-testid="session-btn-submit"], .session-btn.session-btn-submit, button:has-text("Submit")',
      confirmationModal: '[data-testid="confirmation-modal"], .confirmation-modal, .modal-overlay:has(.modal-content)',
      confirmButton: '[data-testid="confirmation-confirm"], button:has-text("Submit Scores"), button:has-text("Confirm"), button.league-text-button.primary:has-text("Submit Scores")',
      activeSessionPanel: '[data-testid="active-session-panel"], [data-testid="active-session"], .active-session-panel',
      
      // Match/Game Form
      matchModal: '[data-testid="add-match-modal"], .drawer-modal, .add-match-modal',
      matchForm: '[data-testid="add-match-form"], #add-match-form',
      team1Section: '[data-testid="team-1-section"], .team-section:has(h3:has-text("Team 1"))',
      team2Section: '[data-testid="team-2-section"], .team-section:has(h3:has-text("Team 2"))',
      playerDropdownContainer: '[data-testid="player-dropdown-container"], .player-dropdown-container',
      playerDropdownInput: '[data-testid="player-dropdown-container"] input.player-dropdown-input, .player-dropdown-container input.player-dropdown-input',
      // Team 1 Player inputs - player dropdowns are in .player-inputs > div > PlayerDropdown
      team1Player1Input: '[data-testid="team-1-section"] .player-inputs > div:nth-child(1) [data-testid="player-dropdown-container"] input.player-dropdown-input, [data-testid="team-1-section"] .player-inputs .player-dropdown-container:first-of-type input.player-dropdown-input, .team-section:has(h3:has-text("Team 1")) .player-inputs > div:first-child .player-dropdown-container input.player-dropdown-input',
      team1Player2Input: '[data-testid="team-1-section"] .player-inputs > div:nth-child(2) [data-testid="player-dropdown-container"] input.player-dropdown-input, [data-testid="team-1-section"] .player-inputs .player-dropdown-container:nth-of-type(2) input.player-dropdown-input, .team-section:has(h3:has-text("Team 1")) .player-inputs > div:nth-child(2) .player-dropdown-container input.player-dropdown-input',
      // Team 2 Player inputs
      team2Player1Input: '[data-testid="team-2-section"] .player-inputs > div:nth-child(1) [data-testid="player-dropdown-container"] input.player-dropdown-input, [data-testid="team-2-section"] .player-inputs .player-dropdown-container:first-of-type input.player-dropdown-input, .team-section:has(h3:has-text("Team 2")) .player-inputs > div:first-child .player-dropdown-container input.player-dropdown-input',
      team2Player2Input: '[data-testid="team-2-section"] .player-inputs > div:nth-child(2) [data-testid="player-dropdown-container"] input.player-dropdown-input, [data-testid="team-2-section"] .player-inputs .player-dropdown-container:nth-of-type(2) input.player-dropdown-input, .team-section:has(h3:has-text("Team 2")) .player-inputs > div:nth-child(2) .player-dropdown-container input.player-dropdown-input',
      // Score inputs
      team1ScoreContainer: '[data-testid="team-1-score-container"], .team-section:has(h3:has-text("Team 1")) .scorecard-container',
      team1ScoreDigit1: '[data-testid="team-1-score-digit-1"], [data-testid="team-1-score-container"] .scorecard-digit-input:nth-of-type(1), .team-section:has(h3:has-text("Team 1")) .scorecard-container .scorecard-digit-input:nth-of-type(1)',
      team1ScoreDigit2: '[data-testid="team-1-score-digit-2"], [data-testid="team-1-score-container"] .scorecard-digit-input:nth-of-type(2), .team-section:has(h3:has-text("Team 1")) .scorecard-container .scorecard-digit-input:nth-of-type(2)',
      team2ScoreContainer: '[data-testid="team-2-score-container"], .team-section:has(h3:has-text("Team 2")) .scorecard-container',
      team2ScoreDigit1: '[data-testid="team-2-score-digit-1"], [data-testid="team-2-score-container"] .scorecard-digit-input:nth-of-type(1), .team-section:has(h3:has-text("Team 2")) .scorecard-container .scorecard-digit-input:nth-of-type(1)',
      team2ScoreDigit2: '[data-testid="team-2-score-digit-2"], [data-testid="team-2-score-container"] .scorecard-digit-input:nth-of-type(2), .team-section:has(h3:has-text("Team 2")) .scorecard-container .scorecard-digit-input:nth-of-type(2)',
      playerDropdownOption: '[data-testid="player-dropdown-option"]:not(.disabled), .player-dropdown-option:not(.disabled)',
      submitMatchButton: '[data-testid="add-match-form"] button[type="submit"], #add-match-form button[type="submit"], button[type="submit"]:has-text("Add Game"), button[type="submit"]:has-text("Update Game")',
      closeMatchModalButton: '[data-testid="add-match-modal"] button[aria-label="Close"], .drawer-modal button[aria-label="Close"], button:has-text("Close")',
      
      // Session
      sessionGroup: '[data-testid="session-group"], [data-session-id], .session-group, .match-date-group',
      sessionMatches: '[data-testid="session-matches"], .session-matches',
      matchCard: '[data-testid="match-card"], .match-card, [class*="match-card"]',
      editSessionButton: '[data-testid="edit-session-button"], .edit-session-button',
      editableMatchCard: '[data-testid="match-card"].editable, .match-card.editable',
      
      // Loading states
      loadingIndicator: '[data-testid="loading"], .loading',
      
      // Edit mode
      emptyState: '.empty-state, [data-testid="empty-state"]',
    };
  }

  /**
   * Navigate to league page
   */
  async goto(leagueId) {
    await super.goto(`/league/${leagueId}`);
    // Wait for page to be ready
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(500);
  }

  /**
   * Click on the Leaderboard tab
   */
  async clickLeaderboardTab() {
    const tab = this.page.locator(this.selectors.leaderboardTab).first();
    await tab.waitFor({ state: 'visible', timeout: 10000 });
    await tab.click();
    // Wait for tab content to load
    await this.page.waitForTimeout(500);
  }

  /**
   * Click on the Games tab
   */
  async clickGamesTab() {
    const tab = this.page.locator(this.selectors.gamesTab).first();
    await tab.waitFor({ state: 'visible', timeout: 10000 });
    await tab.click();
    // Wait for tab content to load
    await this.page.waitForTimeout(500);
  }

  /**
   * Click on a player row in the rankings table
   */
  async clickPlayerRow(playerName) {
    // Try to find player by name in the table (partial match)
    // The rankings table might display names differently, so we use partial matching
    const allRows = this.page.locator(this.selectors.playerRow);
    const rowCount = await allRows.count();
    
    if (rowCount === 0) {
      throw new Error('No player rows found in rankings table');
    }
    
    // Try to find row with the player name (use contains, not exact match)
    let playerRow = allRows.filter({ hasText: playerName });
    const matchingCount = await playerRow.count();
    
    if (matchingCount === 0) {
      // If no match found, click the first row instead
      console.log(`Player "${playerName}" not found in rankings, clicking first row instead`);
      playerRow = allRows.first();
    } else {
      playerRow = playerRow.first();
    }
    
    await playerRow.waitFor({ state: 'visible', timeout: 10000 });
    await playerRow.click();
    // Wait for player details drawer to open
    await this.page.waitForTimeout(500);
  }

  /**
   * Get the selected season from the season selector
   */
  async getSelectedSeason() {
    const selector = this.page.locator(this.selectors.seasonSelector).first();
    if (await selector.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await selector.inputValue();
    }
    return null;
  }

  /**
   * Select a season from the season dropdown
   */
  async selectSeason(seasonValue) {
    const selector = this.page.locator(this.selectors.seasonSelector).first();
    await selector.waitFor({ state: 'visible', timeout: 10000 });
    await selector.selectOption(seasonValue === 'all' ? '' : seasonValue);
    // Wait for season data to load
    await this.page.waitForTimeout(1000);
  }

  /**
   * Close the player details drawer
   */
  async closePlayerDetails() {
    const closeButton = this.page.locator(this.selectors.playerDetailsCloseButton).first();
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeButton.click();
      await this.page.waitForTimeout(300);
    }
  }

  /**
   * Click the "Create Session" button (starts a new session)
   */
  async clickCreateSession() {
    const button = this.page.locator(this.selectors.createSessionButton).first();
    await button.waitFor({ state: 'visible', timeout: 10000 });
    
    // Set up response listener for session creation
    const responsePromise = this.page.waitForResponse(
      response => response.url().includes('/api/sessions') && response.request().method() === 'POST',
      { timeout: 10000 }
    );
    
    await button.click();
    
    // Wait for session to be created
    await responsePromise;
    await this.page.waitForTimeout(500);
  }

  /**
   * Click the "Add Game" or "Add Match" button to open the match creation modal
   * Handles both cases: first match (creates session) and additional matches (session exists)
   */
  async clickAddGame() {
    // Check if there's an active session - if yes, use session-btn-add, otherwise use add-matches-card
    const hasActiveSession = await this.hasActiveSession().catch(() => false);
    
    let button;
    if (hasActiveSession) {
      // Active session exists - use the add match button in the session panel
      button = this.page.locator(this.selectors.addGameButton).first();
    } else {
      // No active session - use the first match button (creates session)
      button = this.page.locator(this.selectors.addFirstGameButton).first();
    }
    
    await button.waitFor({ state: 'visible', timeout: 15000 });
    await button.click();
    // Wait for modal to open
    await this.page.waitForSelector(this.selectors.matchModal, { state: 'visible', timeout: 10000 }).catch(() => {});
    await this.page.waitForTimeout(500);
  }

  /**
   * Fill in the match/game form
   */
  async fillMatchForm({ team1Player1, team1Player2, team2Player1, team2Player2, team1Score, team2Score }) {
    // Player inputs use PlayerDropdown component - type to search and select from dropdown
    if (team1Player1) {
      const input = this.page.locator(this.selectors.team1Player1Input).first();
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.click();
      await input.fill(team1Player1);
      await this.page.waitForTimeout(500);
      // Wait for dropdown option and click it
      const option = this.page.locator(this.selectors.playerDropdownOption).filter({ hasText: team1Player1 }).first();
      await option.waitFor({ state: 'visible', timeout: 3000 });
      await option.click();
      await this.page.waitForTimeout(300);
    }
    
    if (team1Player2) {
      const input = this.page.locator(this.selectors.team1Player2Input).first();
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.click();
      await input.fill(team1Player2);
      await this.page.waitForTimeout(500);
      const option = this.page.locator(this.selectors.playerDropdownOption).filter({ hasText: team1Player2 }).first();
      await option.waitFor({ state: 'visible', timeout: 3000 });
      await option.click();
      await this.page.waitForTimeout(300);
    }
    
    if (team2Player1) {
      const input = this.page.locator(this.selectors.team2Player1Input).first();
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.click();
      await input.fill(team2Player1);
      await this.page.waitForTimeout(500);
      const option = this.page.locator(this.selectors.playerDropdownOption).filter({ hasText: team2Player1 }).first();
      await option.waitFor({ state: 'visible', timeout: 3000 });
      await option.click();
      await this.page.waitForTimeout(300);
    }
    
    if (team2Player2) {
      const input = this.page.locator(this.selectors.team2Player2Input).first();
      await input.waitFor({ state: 'visible', timeout: 5000 });
      await input.click();
      await input.fill(team2Player2);
      await this.page.waitForTimeout(500);
      const option = this.page.locator(this.selectors.playerDropdownOption).filter({ hasText: team2Player2 }).first();
      await option.waitFor({ state: 'visible', timeout: 3000 });
      await option.click();
      await this.page.waitForTimeout(300);
    }
    
    if (team1Score !== undefined) {
      // Format score as two digits (e.g., 21 -> "21", 5 -> "05")
      const scoreStr = String(team1Score).padStart(2, '0');
      const digit1 = scoreStr[0];
      const digit2 = scoreStr[1];
      
      const firstDigit = this.page.locator(this.selectors.team1ScoreDigit1).first();
      const secondDigit = this.page.locator(this.selectors.team1ScoreDigit2).first();
      
      await firstDigit.waitFor({ state: 'visible', timeout: 5000 });
      await firstDigit.fill(digit1);
      await this.page.waitForTimeout(100);
      await secondDigit.fill(digit2);
    }
    
    if (team2Score !== undefined) {
      // Format score as two digits (e.g., 21 -> "21", 5 -> "05")
      const scoreStr = String(team2Score).padStart(2, '0');
      const digit1 = scoreStr[0];
      const digit2 = scoreStr[1];
      
      const firstDigit = this.page.locator(this.selectors.team2ScoreDigit1).first();
      const secondDigit = this.page.locator(this.selectors.team2ScoreDigit2).first();
      
      await firstDigit.waitFor({ state: 'visible', timeout: 5000 });
      await firstDigit.fill(digit1);
      await this.page.waitForTimeout(100);
      await secondDigit.fill(digit2);
    }
  }

  /**
   * Submit the match/game form
   * When editing a session, matches are stored locally and don't trigger API calls until session is saved
   */
  async submitMatchForm(isEditMode = false) {
    const submitButton = this.page.locator(this.selectors.submitMatchButton).first();
    await submitButton.waitFor({ state: 'visible', timeout: 5000 });
    
    if (!isEditMode) {
      // When not in edit mode, wait for API response
      const responsePromise = this.page.waitForResponse(
        response => response.url().includes('/api/matches') && response.request().method() === 'POST',
        { timeout: 10000 }
      );
      
      await submitButton.click();
      await responsePromise;
    } else {
      // When in edit mode, just click and wait for modal to close (changes are stored locally)
      await submitButton.click();
    }
    
    await this.page.waitForTimeout(500);
    
    // Wait for modal to close
    await this.page.waitForSelector(this.selectors.matchModal, { state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  /**
   * Submit/End the current session
   */
  async submitSession() {
    const button = this.page.locator(this.selectors.submitSessionButton).first();
    await button.waitFor({ state: 'visible', timeout: 10000 });
    
    // Set up response listener for session submission BEFORE clicking
    // The endpoint is PATCH /api/leagues/{leagueId}/sessions/{sessionId} with { submit: true }
    const responsePromise = this.page.waitForResponse(
      response => {
        const url = response.url();
        const method = response.request().method();
        return (url.includes('/api/leagues') && url.includes('/sessions/')) &&
               (method === 'PATCH' || method === 'POST');
      },
      { timeout: 20000 }
    );
    
    await button.click();
    
    // Check if a confirmation modal appears (it should for session submission)
    const confirmationModal = this.page.locator(this.selectors.confirmationModal).first();
    const hasConfirmation = await confirmationModal.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (hasConfirmation) {
      // Click the confirm button in the modal
      const confirmButton = this.page.locator(this.selectors.confirmButton).first();
      await confirmButton.waitFor({ state: 'visible', timeout: 5000 });
      await confirmButton.click();
    }
    
    // Wait for the actual API response
    await responsePromise;
    
    // Wait for UI to update after submission (active session should disappear)
    await this.page.waitForTimeout(2000);
    
    // Wait for active session panel to disappear as confirmation
    await this.page.waitForSelector(this.selectors.activeSessionPanel, { state: 'hidden', timeout: 10000 }).catch(() => {
      // If it doesn't disappear, wait a bit more and check again
    });
    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if active session panel is visible
   */
  async hasActiveSession() {
    return await this.isVisible(this.selectors.activeSessionPanel);
  }

  /**
   * Wait for rankings table to be visible or empty state to appear
   * Rankings table only renders when there's data; empty arrays show an empty state message
   */
  async waitForRankingsTable() {
    // Wait for either the rankings table OR the empty state message OR skeleton
    // The table only exists if there's data, otherwise there's an empty state
    await Promise.race([
      this.page.waitForSelector(this.selectors.rankingsTable, { state: 'attached', timeout: 15000 }).catch(() => null),
      this.page.waitForSelector('.loading:has-text("No rankings available")', { state: 'attached', timeout: 15000 }).catch(() => null),
      this.page.waitForSelector('.rankings-table-wrapper', { state: 'attached', timeout: 15000 }).catch(() => null),
    ]);
    
    // Give it a moment to render
    await this.page.waitForTimeout(1000);
  }
  
  /**
   * Check if rankings table exists (has data) vs empty state
   */
  async hasRankingsTable() {
    return await this.isVisible(this.selectors.rankingsTable);
  }
  
  /**
   * Check if rankings empty state is shown
   */
  async hasRankingsEmptyState() {
    return await this.page.locator('.loading:has-text("No rankings available")').isVisible({ timeout: 2000 }).catch(() => false);
  }

  /**
   * Wait for matches table to be visible
   */
  async waitForMatchesTable() {
    await this.page.waitForSelector(this.selectors.matchesTable, { state: 'visible', timeout: 10000 }).catch(() => {});
    // Also check for session groups as matches might be grouped
    await this.page.waitForTimeout(500);
  }

  /**
   * Get the number of matches in the most recent session
   */
  async getMatchesCountInRecentSession() {
    // Try to find the most recent session group
    const sessionGroups = this.page.locator(this.selectors.sessionGroup);
    const count = await sessionGroups.count();
    if (count === 0) {
      // Try alternative selectors - matches might be in a different structure
      const allMatches = this.page.locator(this.selectors.matchCard);
      return await allMatches.count();
    }
    
    // Get the first session group (should be the most recent)
    const firstSession = sessionGroups.first();
    const matches = firstSession.locator(this.selectors.matchCard);
    const matchCount = await matches.count();
    
    // If no matches found in first session, try finding all matches on the page
    if (matchCount === 0) {
      const allMatches = this.page.locator(this.selectors.matchCard);
      return await allMatches.count();
    }
    
    return matchCount;
  }

  /**
   * Click the edit session button for a submitted session
   * @param {number} sessionId - Optional session ID. If not provided, edits the first editable session.
   */
  async clickEditSession(sessionId = null) {
    // Try to find the edit button, prioritizing session ID if provided
    let editButton;
    
    if (sessionId) {
      // Try multiple strategies to find the session group
      const sessionGroup1 = this.page.locator(`[data-session-id="${sessionId}"]`).first();
      const sessionGroup2 = this.page.locator(`[data-testid="session-group"]:has([data-session-id="${sessionId}"])`).first();
      const sessionGroup3 = this.page.locator(`.session-group:has([data-session-id="${sessionId}"])`).first();
      
      // Try to find edit button in any of these session groups
      const editButton1 = sessionGroup1.locator(this.selectors.editSessionButton).first();
      const editButton2 = sessionGroup2.locator(this.selectors.editSessionButton).first();
      const editButton3 = sessionGroup3.locator(this.selectors.editSessionButton).first();
      
      // Check which one is visible
      if (await editButton1.isVisible({ timeout: 2000 }).catch(() => false)) {
        editButton = editButton1;
      } else if (await editButton2.isVisible({ timeout: 2000 }).catch(() => false)) {
        editButton = editButton2;
      } else if (await editButton3.isVisible({ timeout: 2000 }).catch(() => false)) {
        editButton = editButton3;
      } else {
        // Fallback to first edit button found on page
        editButton = this.page.locator(this.selectors.editSessionButton).first();
      }
    } else {
      // Click the first edit session button found
      editButton = this.page.locator(this.selectors.editSessionButton).first();
    }
    
    await editButton.waitFor({ state: 'visible', timeout: 10000 });
    await editButton.click();
    
    // Wait for edit mode to activate (session buttons should change)
    await this.page.waitForTimeout(500);
  }

  /**
   * Click on a match card to edit it (only works when session is in edit mode)
   * @param {number} matchIndex - Index of the match card to click (0-based)
   */
  async clickMatchCardToEdit(matchIndex = 0) {
    const matchCards = this.page.locator(this.selectors.editableMatchCard);
    const matchCard = matchCards.nth(matchIndex);
    await matchCard.waitFor({ state: 'visible', timeout: 10000 });
    await matchCard.click();
    
    // Wait for edit modal to open
    await this.page.waitForSelector(this.selectors.matchModal, { state: 'visible', timeout: 10000 });
    await this.page.waitForTimeout(500);
  }

  /**
   * Save edited session (clicks the save changes button)
   */
  async saveEditedSession() {
    const saveButton = this.page.locator('[data-testid="session-btn-save"], .session-btn.session-btn-submit').first();
    await saveButton.waitFor({ state: 'visible', timeout: 10000 });
    
    // Set up response listener for session save
    const responsePromise = this.page.waitForResponse(
      response => {
        const url = response.url();
        return (url.includes('/api/leagues') && url.includes('/sessions/')) &&
               (response.request().method() === 'PATCH' || response.request().method() === 'PUT');
      },
      { timeout: 20000 }
    );
    
    await saveButton.click();
    
    // Wait for save to complete
    await responsePromise;
    await this.page.waitForTimeout(2000);
  }

  /**
   * Cancel editing session (clicks the cancel button)
   */
  async cancelEditSession() {
    const cancelButton = this.page.locator('[data-testid="session-btn-cancel"], .session-btn.session-btn-cancel').first();
    await cancelButton.waitFor({ state: 'visible', timeout: 10000 });
    await cancelButton.click();
    
    // Wait for edit mode to exit
    await this.page.waitForTimeout(1000);
  }

  /**
   * Check if a session is in edit mode (by looking for save/cancel buttons)
   */
  async isSessionInEditMode() {
    const saveButton = this.page.locator('[data-testid="session-btn-save"]').first();
    return await saveButton.isVisible({ timeout: 2000 }).catch(() => false);
  }
}
