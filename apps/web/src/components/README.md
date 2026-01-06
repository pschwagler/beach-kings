# Components Directory Structure

This directory contains all React components organized by feature/functionality.

## Directory Organization

### `ui/`
Basic reusable UI components used throughout the application.
- **UI.jsx** - Core UI components (Button, Alert, Tooltip, Tabs)

### `layout/`
Layout and navigation components.
- **NavBar.jsx** - Main navigation bar
- **HeroHeader.jsx** - Hero header with rotating images
- **navbar/** - NavBar sub-components
  - NavBrand.jsx
  - RecordGamesButton.jsx
  - LeaguesMenu.jsx
  - UserMenu.jsx
  - NavDropdown.jsx
  - NavDropdownItem.jsx
  - NavDropdownSection.jsx
  - VolleyballIcon.jsx

### `player/`
Player-related components for displaying and managing player information.
- **PlayerDetails.jsx** - Main player details view
- **PlayerDetailsPanel.jsx** - Side panel for player details
- **PlayerDetailsSideTab.jsx** - Tab to open player details panel
- **PlayerDropdown.jsx** - Dropdown for selecting players
- **PlayerOverview.jsx** - Overview stats for a player
- **PlayerSelector.jsx** - Player selection component
- **PlayerStatsTable.jsx** - Table displaying player statistics

### `match/`
Match-related components for displaying and managing matches.
- **MatchesTable.jsx** - Main matches table view
- **MatchHistoryTable.jsx** - Historical match data table
- **MatchCard.jsx** - Individual match card component
- **AddMatchModal.jsx** - Modal for adding/editing matches

### `session/`
Session management components.
- **ActiveSessionPanel.jsx** - Panel for active session
- **SessionActions.jsx** - Action buttons for sessions
- **SessionHeader.jsx** - Header for session display

### `rankings/`
Rankings and leaderboard components.
- **RankingsTable.jsx** - Main rankings/leaderboard table

### `control/`
Control and admin panel components.
- **ControlPanel.jsx** - Admin control panel

### `modal/`
Reusable modal components.
- **ConfirmationModal.jsx** - Confirmation dialog modal

### `whatsapp/`
WhatsApp integration components.
- **ConnectionStatus.jsx**
- **ErrorAlert.jsx**
- **GroupSelector.jsx**
- **LoadingSpinner.jsx**
- **QRCodeDisplay.jsx**

## Import Examples

```javascript
// UI components
import { Button, Alert, Tabs } from './components/ui/UI';

// Layout components
import NavBar from './components/layout/NavBar';
import HeroHeader from './components/layout/HeroHeader';

// Feature components
import MatchesTable from './components/match/MatchesTable';
import PlayerDetailsPanel from './components/player/PlayerDetailsPanel';
import RankingsTable from './components/rankings/RankingsTable';

// Modal components
import ConfirmationModal from './components/modal/ConfirmationModal';
```
