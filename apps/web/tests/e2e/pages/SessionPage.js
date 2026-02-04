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
      playersModal: '.session-players-modal',
      playersModalClose: '.session-players-modal .modal-close-button',
      playersList: '.session-players-list',
      playersListItem: '.session-players-list-item',
      removePlayerButton: '.session-players-remove',
      addPlayerSection: '.session-players-add',
      addPlayerSearch: '.session-players-filters input[type="text"]',
      addPlayerButton: '.session-players-add-btn',
      loadMoreButton: '.session-players-load-more',
      modalDoneButton: '.modal-actions .league-text-button.primary',

      // Add players block (when < 4 players)
      addPlayersBlock: '.session-page-add-players-block',

      // Match management
      addMatchButton: 'button:has-text("Add Game"), button:has-text("+ Add")',
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
   * Wait for session page to be ready
   */
  async waitForReady() {
    // Wait for loading to complete
    await this.page.waitForFunction(() => {
      const loading = document.querySelector('.session-page-loading');
      const error = document.querySelector('.session-page-error');
      const ready = document.querySelector('.session-page-header');
      return !loading && (ready || error);
    }, { timeout: 15000 });
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
   * Open manage players modal
   */
  async openManagePlayersModal() {
    await this.click(this.selectors.managePlayers);
    await this.page.waitForSelector(this.selectors.playersModal, { state: 'visible', timeout: 5000 });
  }

  /**
   * Close manage players modal
   */
  async closeManagePlayersModal() {
    await this.click(this.selectors.modalDoneButton);
    await this.page.waitForSelector(this.selectors.playersModal, { state: 'hidden', timeout: 5000 });
  }

  /**
   * Get count of players in session
   */
  async getPlayersCount() {
    await this.page.waitForSelector(this.selectors.playersModal, { state: 'visible', timeout: 5000 });
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
   * Remove a player from the session
   */
  async removePlayerByName(name) {
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
   * Click add match button
   */
  async clickAddMatch() {
    await this.click(this.selectors.addMatchButton);
    // Wait for modal
    await this.page.waitForSelector('.add-match-modal, .modal-content', { state: 'visible', timeout: 5000 });
  }

  /**
   * Fill match form (similar to LeaguePage)
   */
  async fillMatchForm({ team1Player1, team1Player2, team2Player1, team2Player2, team1Score, team2Score }) {
    // Select players
    const selects = await this.page.locator('.add-match-modal select, .modal-content select').all();

    if (selects.length >= 4) {
      await selects[0].selectOption({ label: team1Player1 });
      await selects[1].selectOption({ label: team1Player2 });
      await selects[2].selectOption({ label: team2Player1 });
      await selects[3].selectOption({ label: team2Player2 });
    }

    // Fill scores
    const scoreInputs = await this.page.locator('.add-match-modal input[type="number"], .modal-content input[type="number"]').all();
    if (scoreInputs.length >= 2) {
      await scoreInputs[0].fill(String(team1Score));
      await scoreInputs[1].fill(String(team2Score));
    }
  }

  /**
   * Submit match form
   */
  async submitMatchForm() {
    await this.page.locator('.add-match-modal button:has-text("Save"), .modal-content button:has-text("Save")').click();
    await this.page.waitForSelector('.add-match-modal, .modal-content', { state: 'hidden', timeout: 5000 });
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
