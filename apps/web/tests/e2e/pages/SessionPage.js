import { BasePage } from './BasePage.js';

/**
 * Page Object Model for Session Page (pickup/non-league sessions)
 */
export class SessionPage extends BasePage {
  constructor(page) {
    super(page);
    this.selectors = {
      // Session header
      sessionTitle: '.session-page-title',
      sessionTitleEdit: '.session-page-title-edit',
      sessionTitleInput: '.session-page-title-input',
      sessionTitleSave: '.session-page-title-save',
      deleteSessionButton: '.session-page-delete-link:has-text("Delete Session")',
      leaveSessionButton: '.session-page-delete-link:has-text("Leave Session")',

      // Session badges
      pickupBadge: '.open-sessions-list-badge.pickup',
      leagueBadge: '.open-sessions-list-badge.league',

      // Share/invite
      inviteButton: '.session-share-trigger',
      shareDropdown: '.session-share-dropdown-menu',
      copyLinkButton: '.session-share-dropdown-item:has-text("Copy link")',
      shareViaButton: '.session-share-dropdown-item:has-text("Share via")',

      // Players management
      managePlayers: 'button:has-text("Manage players")',
      playersModal: '.session-players-drawer, .session-players-modal',
      playersDrawer: '.session-players-drawer',
      playersModalClose: '.session-players-drawer .modal-close-button, .session-players-modal .modal-close-button',
      playersList: '.session-players-list',
      playersListItem: '.session-players-list-item',
      removePlayerButton: '.session-players-remove',
      addPlayerSection: '.session-players-add',
      addPlayerSearch: '.session-players-search, .session-players-filters input[type="text"]',
      addPlayerButton: '.session-players-add-btn',
      loadMoreButton: '.session-players-load-more',
      modalDoneButton: '.session-players-drawer-actions .league-text-button.primary, .modal-actions .league-text-button.primary',

      // Add players block (when < 4 players)
      addPlayersBlock: '.session-page-add-players-block',

      // Match management
      addMatchButton: '[data-testid="session-btn-add"], button:has-text("Add New Match")',
      matchCard: '.match-card',
      matchesTable: '.session-matches-table',

      // View toggle
      viewCardsButton: '.view-toggle-button:has-text("Cards")',
      viewTableButton: '.view-toggle-button:has-text("Table")',

      // Actions
      submitButton: 'button:has-text("Submit")',
      statsButton: 'button:has-text("Stats")',

      // Back navigation
      backLink: '.session-page-back',

      // Loading/error states
      loadingState: '.session-page-loading',
      errorState: '.session-page-error',
    };
  }

  /**
   * Navigate to session by code
   */
  async goto(code) {
    await super.goto(`/session/${code}`);
    // Wait for session to load
    await this.page.waitForSelector('.session-page', { timeout: 15000 });
  }

  /**
   * Wait for session page to be ready.
   * Waits for loading to complete and React to settle (including auto-opening modals).
   */
  async waitForReady() {
    // Wait for loading to complete
    await this.page.waitForFunction(() => {
      const loading = document.querySelector('.session-page-loading');
      const error = document.querySelector('.session-page-error');
      const ready = document.querySelector('.session-page-header');
      return !loading && (ready || error);
    }, { timeout: 15000 });
    // Wait for React to finish pending renders (e.g., auto-opening manage players modal)
    await this.page.waitForTimeout(500);
  }

  /**
   * Check if page is showing error state
   */
  async hasError() {
    return await this.isVisible(this.selectors.errorState);
  }

  /**
   * Get session title
   */
  async getTitle() {
    return await this.getText(this.selectors.sessionTitle);
  }

  /**
   * Check if this is a pickup session
   */
  async isPickupSession() {
    return await this.isVisible(this.selectors.pickupBadge);
  }

  /**
   * Check if "add players" block is visible (when < 4 players)
   */
  async needsMorePlayers() {
    return await this.isVisible(this.selectors.addPlayersBlock);
  }

  /**
   * Open manage players modal.
   * Handles the case where the modal auto-opens (when < 4 players).
   */
  async openManagePlayersModal() {
    const isOpen = await this.page.locator(this.selectors.playersModal).isVisible().catch(() => false);
    if (!isOpen) {
      await this.click(this.selectors.managePlayers);
      await this.page.waitForSelector(this.selectors.playersModal, { state: 'visible', timeout: 5000 });
    }
  }

  /**
   * Close manage players modal
   */
  async closeManagePlayersModal() {
    await this.click(this.selectors.modalDoneButton);
    await this.page.waitForSelector(this.selectors.playersModal, { state: 'hidden', timeout: 5000 });
  }

  /**
   * Get count of players in session.
   * Switches to the "In this session" tab to count session participants.
   */
  async getPlayersCount() {
    await this.page.waitForSelector(this.selectors.playersModal, { state: 'visible', timeout: 5000 });
    // Switch to "In this session" tab to see participants
    const inSessionTab = this.page.locator('[role="tab"]:has-text("In this session")');
    await inSessionTab.click();
    await this.page.waitForTimeout(300);
    const items = await this.page.locator(this.selectors.playersListItem).all();
    return items.length;
  }

  /**
   * Search for a player in the add player section
   */
  async searchPlayer(name) {
    await this.page.fill(this.selectors.addPlayerSearch, name);
    // Wait for debounce and results
    await this.page.waitForTimeout(400);
  }

  /**
   * Add a player by clicking their add button
   */
  async addPlayerByName(name) {
    // Find the player in the add list and click add
    const addListItem = this.page.locator(`.session-players-add-item:has-text("${name}")`);
    await addListItem.waitFor({ state: 'visible', timeout: 5000 });
    await addListItem.locator(this.selectors.addPlayerButton).click();
    // Wait for refresh
    await this.page.waitForTimeout(500);
  }

  /**
   * Remove a player from the session.
   * Switches to the "In this session" tab first since the modal may default to "Add players".
   */
  async removePlayerByName(name) {
    // Switch to "In this session" tab
    const inSessionTab = this.page.locator('[role="tab"]:has-text("In this session")');
    await inSessionTab.click();
    await this.page.waitForTimeout(300);

    const playerItem = this.page.locator(`.session-players-list-item:has-text("${name}")`);
    await playerItem.waitFor({ state: 'visible', timeout: 5000 });
    await playerItem.locator(this.selectors.removePlayerButton).click();
    // Wait for refresh
    await this.page.waitForTimeout(500);
  }

  /**
   * Check if modal has message/error
   */
  async getModalMessage() {
    const message = this.page.locator('.session-players-message');
    if (await message.isVisible().catch(() => false)) {
      return await message.textContent();
    }
    return null;
  }

  /**
   * Click add match button to open the Add New Game modal.
   */
  async clickAddMatch() {
    await this.click(this.selectors.addMatchButton);
    // Wait for Add Match modal
    await this.page.waitForSelector('[data-testid="add-match-modal"]', { state: 'visible', timeout: 5000 });
  }

  /**
   * Fill the Add Match modal form using PlayerDropdown autocomplete and ScoreCardInput.
   */
  async fillMatchForm({ team1Player1, team1Player2, team2Player1, team2Player2, team1Score, team2Score }) {
    const modal = this.page.locator('[data-testid="add-match-modal"]');
    const playerInputs = await modal.locator('.player-dropdown-input').all();
    const playerNames = [team1Player1, team1Player2, team2Player1, team2Player2];

    for (let i = 0; i < Math.min(playerInputs.length, playerNames.length); i++) {
      await playerInputs[i].click();
      await playerInputs[i].fill(playerNames[i]);
      await this.page.waitForTimeout(400);
      // Click the matching dropdown option (portaled to body)
      const option = this.page.locator(`[data-testid="player-dropdown-option"]:has-text("${playerNames[i]}")`).first();
      await option.click();
      await this.page.waitForTimeout(200);
    }

    // Fill scores using ScoreCardInput digit inputs
    const score1Str = String(team1Score).padStart(2, '0');
    const score2Str = String(team2Score).padStart(2, '0');

    await this.page.locator('[data-testid="team-1-score-digit-1"]').fill(score1Str[0]);
    await this.page.locator('[data-testid="team-1-score-digit-2"]').fill(score1Str[1]);
    await this.page.locator('[data-testid="team-2-score-digit-1"]').fill(score2Str[0]);
    await this.page.locator('[data-testid="team-2-score-digit-2"]').fill(score2Str[1]);
  }

  /**
   * Submit the match form by clicking "Add Game" or "Update Game".
   */
  async submitMatchForm() {
    await this.page.locator('[data-testid="add-match-modal"] button:has-text("Add Game"), [data-testid="add-match-modal"] button:has-text("Update Game")').click();
    await this.page.waitForSelector('[data-testid="add-match-modal"]', { state: 'hidden', timeout: 10000 });
  }

  /**
   * Get count of matches/games in the session
   */
  async getMatchesCount() {
    const cards = await this.page.locator(this.selectors.matchCard).all();
    return cards.length;
  }

  /**
   * Click invite button and copy link
   */
  async copyInviteLink() {
    await this.click(this.selectors.inviteButton);
    await this.page.waitForSelector(this.selectors.shareDropdown, { state: 'visible', timeout: 3000 });
    await this.click(this.selectors.copyLinkButton);
    // Wait for copy action
    await this.page.waitForTimeout(300);
  }

  /**
   * Submit the session (lock in scores)
   */
  async submitSession() {
    await this.click(this.selectors.submitButton);
    // Wait for confirmation modal
    await this.page.waitForSelector('.modal-content', { state: 'visible', timeout: 5000 });
    await this.page.locator('.modal-content button:has-text("Submit")').click();
    await this.page.waitForTimeout(1000);
  }

  /**
   * Delete the session
   */
  async deleteSession() {
    await this.click(this.selectors.deleteSessionButton);
    // Wait for confirmation modal
    await this.page.waitForSelector('.modal-content', { state: 'visible', timeout: 5000 });
    await this.page.locator('.modal-content button:has-text("Delete")').click();
    // Wait for navigation to home
    await this.page.waitForURL('**/home**', { timeout: 10000 });
  }

  /**
   * Navigate back to my games
   */
  async goBack() {
    await this.click(this.selectors.backLink);
    await this.page.waitForURL('**/home**', { timeout: 10000 });
  }
}
