# 🏐 Beach Volleyball ELO Rating System

A modern web application for tracking beach volleyball player rankings using an ELO-based rating system with a points-based leaderboard.

## 🌟 Features

- **📊 Points & Rankings** - Track players with a points system (3 pts/win, 1 pt/loss)
- **📈 ELO Ratings** - Sophisticated skill-based rating calculations
- **👥 Partnership Analytics** - See performance with different partners
- **⚔️ Opponent Analysis** - Track win rates against specific opponents
- **📅 Match History** - Complete game-by-game breakdown for each player
- **🎨 Modern UI** - React-based interface with vintage Malibu beach theme
- **🔄 Google Sheets Integration** - Easy data entry via spreadsheet
- **🎮 Live Session Management** - Create sessions and add matches in real-time
- **📱 WhatsApp Integration** - Send notifications and updates via WhatsApp
- **🚀 Live Deployment** - Hosted on Railway with automatic updates

## 🎯 How It Works

### Rating Calculation

This system uses the [ELO rating algorithm](https://en.wikipedia.org/wiki/Elo_rating_system) originally developed for chess. Here's how it's adapted for beach volleyball:

#### Team-Based ELO
Since beach volleyball is played 2v2, the system:
1. **Averages each team's player ratings** to get a team rating
2. **Calculates expected outcome** based on rating difference
3. **Updates both players' ratings equally** based on actual result

#### Point System
In addition to ELO, players earn **Points** for ranking:
- **+3 points** for each win
- **+1 point** for each loss (participation)

The leaderboard is sorted by Points, encouraging both winning and participation.

#### K-Factor
The K-factor (currently set to 40) determines how much ratings change per match. Higher K = more volatile ratings.

#### Point Differential (Optional)
The system can optionally factor in margin of victory. Currently set to `USE_POINT_DIFFERENTIAL = False` for traditional win/loss only.

When enabled:
- Close games (21-19) = smaller rating changes
- Blowouts (21-5) = larger rating changes

### Statistics Tracked

For each player:
- **Overall Stats** - Points, games played, wins, losses, win rate, avg point differential
- **Partnership Stats** - Performance with each partner
- **Opponent Stats** - Performance against each opponent
- **Match History** - Complete game log with dates, partners, scores, results
- **Rating History** - ELO changes over time

## 🏗️ Architecture

### Tech Stack

**Backend:**
- **Python 3.11** - Core calculation engine
- **FastAPI** - REST API framework
- **Pandas** - Data processing
- **Google Sheets API** - Data input/integration

**Frontend:**
- **React 18** - UI framework
- **Vite** - Build tool
- **Lucide React** - Modern icon library
- **Vanilla CSS** - Vintage Malibu beach theme

**Deployment:**
- **Railway.app** - Hosting platform
- **Docker** - Containerization
- **JSON Files** - Data storage (no database needed)

### Project Structure

```
beach-volleyball-elo/
├── api.py                    # FastAPI REST server
├── elo_calculator.py         # Core ELO calculation logic
├── match.py                  # Google Sheets integration (local use)
├── frontend/                 # React application
│   ├── src/
│   │   ├── App.jsx          # Main component
│   │   ├── App.css          # Vintage Malibu styling
│   │   ├── components/      # UI components
│   │   └── services/        # API client
│   └── dist/                # Production build
├── output/                   # Generated JSON data
├── Dockerfile               # Railway deployment
└── requirements.txt         # Python dependencies
```

## 🚀 Quick Start

### Option 1: Use the Live App (Recommended)

Visit the deployed application on Railway:
**[Your Railway URL here]**

1. Click **"Recalculate Stats"** to pull latest data from Google Sheets
2. View **Rankings** or **Matches** tabs
3. Click any player name to see detailed stats

### Option 2: Run Locally

#### Prerequisites
- Python 3.7+ (3.11 recommended)
- Node.js 18+
- Google Sheets API credentials

#### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/beach-volleyball-elo.git
cd beach-volleyball-elo
```

2. **Install Python dependencies:**
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

3. **Build the React frontend:**
```bash
cd frontend
npm install
npm run build
cd ..
```

4. **Set up Google Sheets credentials:**
   - Follow instructions in [SETUP_CREDENTIALS.md](SETUP_CREDENTIALS.md)
   - Place `credentials.json` in the project root

5. **Run the server:**
```bash
uvicorn backend.api.main:app --reload
```

6. **Visit the app:**
   - Open http://localhost:8000 in your browser

### Optional: WhatsApp Integration

To enable WhatsApp notifications:

**Option A - Automatic (recommended):**
```bash
./start-all.sh
```
This starts both the main app and WhatsApp service together.

**Option B - Manual:**
```bash
# Install WhatsApp service dependencies
make whatsapp-install

# In a separate terminal, start the WhatsApp service
make whatsapp
```

Then visit `/whatsapp` in the app to connect. See [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md) for detailed instructions.

### Option 3: Legacy Google Sheets Script

You can still use the original Python script to update Google Sheets directly:

```bash
source venv/bin/activate
python match.py
```

This will:
- Read from the "Matches" worksheet
- Calculate all statistics
- Update "Points", "ELO Timeline", and individual player worksheets

## 📊 Google Sheets Setup

### Required Worksheets

1. **Matches** - Input data with columns:
   - `DATE` - Match date
   - `T1P1`, `T1P2` - Team 1 players
   - `T2P1`, `T2P2` - Team 2 players
   - `T1SCORE`, `T2SCORE` - Final scores
   - `Team 1 ELO +/-`, `Team 2 ELO +/-` - Auto-filled by script

2. **Points** - Auto-generated rankings (sorted by points)
3. **ELO Timeline** - Historical ratings by date (for graphing)
4. **Rank Changes** - ELO after each match
5. **[Player Names]** - Individual player worksheets (auto-created)

### Template

Use this [Google Sheets template](https://docs.google.com/spreadsheets/d/1KZhd5prjzDjDTJCvg0b1fxVAM-uGDBxsHJJwKBKrBIA/edit?usp=sharing) as a starting point.

## 🔧 API Endpoints

The FastAPI server exposes these endpoints:

### Main Endpoints

- `POST /api/calculate` - Recalculate all statistics from Google Sheets
- `GET /api/rankings` - Get current points rankings
- `GET /api/matches` - Get all matches (sorted by date)
- `GET /api/players` - List all players
- `GET /api/players/{name}` - Get detailed player statistics
- `GET /api/players/{name}/matches` - Get player's match history
- `GET /api/elo-timeline` - Get ELO history for all players
- `GET /api/health` - Health check

### Session Management Endpoints (New!)

- `GET /api/sessions` - List all gaming sessions
- `GET /api/sessions/active` - Get currently active session
- `POST /api/sessions` - Create new session
- `POST /api/sessions/{id}/end` - End a session
- `POST /api/matches/create` - Add match to session

### Interactive Documentation

Visit `/docs` for interactive API documentation (auto-generated by FastAPI).

## 🎨 Customization

### Change Rating Parameters

Edit `elo_calculator.py`:

```python
K = 40  # K-factor (higher = more volatile ratings)
INITIAL_ELO = 1200  # Starting rating for new players
USE_POINT_DIFFERENTIAL = False  # Factor in margin of victory
```

### Change Points System

Edit the `points` property in `elo_calculator.py`:

```python
@property
def points(self):
    """Calculate points: +3 for each win, +1 for each loss."""
    losses = self.game_count - self.win_count
    return (self.win_count * 3) + (losses * 1)  # Modify formula here
```

### Customize UI Theme

Edit `frontend/src/App.css` to change colors:

```css
:root {
  --sunset-orange: #ff6b35;  /* Primary accent */
  --ocean-blue: #4a90a4;     /* Buttons & headers */
  --sand: #f4e4c1;           /* Borders */
  /* ... more color variables */
}
```

### Change Google Sheets Link

Edit `frontend/src/components/ControlPanel.jsx`:

```javascript
const GOOGLE_SHEETS_URL = 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit';
```

## 🚢 Deployment to Railway

### Prerequisites
- GitHub account
- Railway.app account (free tier works)
- Google Sheets API credentials

### Deploy Steps

1. **Push code to GitHub:**
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Create Railway project:**
   - Visit [railway.app](https://railway.app)
   - Click "Start a New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Configure environment variables:**
   - In Railway dashboard → Variables tab
   - Add variable `CREDENTIALS_JSON`
   - Paste entire contents of your `credentials.json` file

4. **Deploy:**
   - Railway automatically builds using the Dockerfile
   - Get your public URL from Settings → Domains

5. **Use your app:**
   - Visit your Railway URL
   - Click "Recalculate Stats" to sync from Google Sheets
   - Share the URL with your teammates!

### Deployment Details

The app uses Docker for deployment:
- Python 3.11 runtime
- Node.js 20 for building React frontend
- Automatic builds on git push
- Free tier: 500 hours/month (plenty for personal use)

## 📖 Usage

### Web Interface

1. **View Rankings:**
   - Default view shows all players sorted by Points
   - Click column headers to sort
   - Click player names for detailed stats

2. **View Matches:**
   - Click "Matches" tab
   - See all games by date (newest first)
   - Click any player name to see their stats

3. **Player Details:**
   - Shows overall stats
   - Partnership breakdown (who you play best with)
   - Opponent breakdown (who you beat most)
   - Complete match history (color-coded wins/losses)

4. **Update Data:**
   - Add new matches to Google Sheets
   - Click "Recalculate Stats" in the web app
   - Rankings automatically refresh

### Live Session Management (New! 🎮)

Add the `?gameon` parameter to the URL to enable real-time match entry:

```
http://localhost:8000/?gameon
```

**Features:**
- **Create Sessions** - Start a new gaming session (automatically named by date)
- **Add Matches** - Add matches on-the-fly during gameplay
- **End Sessions** - Close sessions when done (prevents further edits)
- **Player Autocomplete** - Existing players suggested, new players auto-created

**Workflow:**
1. Navigate to app with `?gameon` parameter
2. Click "Start New Session"
3. Click "Add Match" to record games as they happen
4. Enter player names and scores
5. Click "End Session" when done playing

Multiple sessions on the same date are automatically numbered (e.g., "11/7/2025 #2").

See [SESSION_FEATURE.md](SESSION_FEATURE.md) for detailed documentation.

### Local Script

For bulk operations or automation:

```bash
source venv/bin/activate
python match.py
```

This updates all Google Sheets worksheets directly.

## 🧮 Rating System Details

### How Ratings Change

The ELO formula:

```
New Rating = Old Rating + K × (Actual Score - Expected Score)
```

Where:
- **K** = 40 (how much ratings can change)
- **Actual Score** = 1.0 for win, 0.0 for loss (or calculated from point differential)
- **Expected Score** = Probability of winning based on rating difference

**Example:**
- Player A (Rating: 1200) and Player B (Rating: 1200) vs Player C (Rating: 1100) and Player D (Rating: 1100)
- Team 1 avg: 1200, Team 2 avg: 1100
- Expected: Team 1 has ~64% chance to win
- If Team 1 wins: Both A and B gain ~+14 rating, C and D lose ~-14
- If Team 2 wins (upset): C and D gain ~+26, A and B lose ~-26

### Why Team-Based?

Traditional ELO is 1v1. For 2v2:
- Both teammates get the same rating change
- Team strength = average of both players
- Encourages balanced partnerships

### Points vs Rating

- **Points** = Cumulative score (rewards participation and winning)
- **Rating** = Skill indicator (relative strength, can go up or down)

Points determine **leaderboard position**, Rating indicates **skill level**.

## 📚 Additional Documentation

- [SESSION_FEATURE.md](SESSION_FEATURE.md) - Live session management guide (New!)
- [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) - Technical implementation details
- [SETUP_CREDENTIALS.md](SETUP_CREDENTIALS.md) - Google Sheets API setup
- [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) - Detailed deployment guide
- [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md) - WhatsApp local development guide
- [RAILWAY_WHATSAPP.md](RAILWAY_WHATSAPP.md) - WhatsApp production deployment
- [QUICKSTART_WHATSAPP.md](QUICKSTART_WHATSAPP.md) - WhatsApp quick start
- [REACT_SETUP.md](REACT_SETUP.md) - Frontend development guide (if exists)
- [API_README.md](API_README.md) - Complete API documentation (if exists)

## 🛠️ Development

### Frontend Development (with hot reload)

**Terminal 1 - Backend:**
```bash
source venv/bin/activate
uvicorn api:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Visit http://localhost:3000 for instant hot-reload during development.

### Project Components

- `elo_calculator.py` - Core rating logic (data source agnostic)
- `match.py` - Google Sheets integration
- `api.py` - REST API server
- `frontend/` - React application

## 🤝 Contributing

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Fork for your own league

## 📝 License

MIT License - See [LICENSE](LICENSE) file for details.

## 🏆 Credits

Originally based on [google-sheets-elo-system](https://github.com/Eddykasp/google-sheets-elo-system) by Eddykasp.

Extended with:
- Modern React frontend
- REST API
- Enhanced statistics
- Railway deployment
- Points system
- Match history tracking
- Partnership and opponent analytics

---

**Built with ❤️ for beach volleyball communities** 🌴🌊
