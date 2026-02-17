# 🏐 Beach Volleyball ELO Rating System

A modern web application for tracking beach volleyball player rankings using an ELO-based rating system with a points-based leaderboard.

## 🌟 Features

- **📊 Points & Rankings** - Track players with a points system (3 pts/win, 1 pt/loss)
- **📈 ELO Ratings** - Sophisticated skill-based rating calculations
- **👥 Partnership Analytics** - See performance with different partners
- **⚔️ Opponent Analysis** - Track win rates against specific opponents
- **📅 Match History** - Complete game-by-game breakdown for each player
- **🎨 Modern UI** - React-based interface with vintage Malibu beach theme
- **💾 Database-Driven** - PostgreSQL database for reliable data storage
- **🎮 Live Session Management** - Create sessions and add matches in real-time
- **📱 WhatsApp Integration** - Send notifications and updates via WhatsApp
- **🚀 Docker Deployment** - Containerized deployment with Docker Compose

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

The default branch is `develop`. Open PRs against `develop`; CI (lint + tests) and code review run on PRs targeting `develop`.

### Tech Stack

**Backend:**
- **Python 3.11** - Core calculation engine
- **FastAPI** - REST API framework
- **PostgreSQL** - Primary database
- **SQLAlchemy** - ORM for database operations
- **Alembic** - Database migrations

**Frontend:**
- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **Lucide React** - Modern icon library
- **Vanilla CSS** - Vintage Malibu beach theme

**Deployment:**
- **Docker** - Containerization
- **PostgreSQL** - Database
- **Redis** - Caching and rate limiting

### Project Structure

```
beach-kings/
├── backend/                 # FastAPI backend
│   ├── api/                 # API routes and main app
│   ├── services/            # Business logic services
│   ├── database/            # Database models and setup
│   └── alembic/             # Database migrations
├── frontend/                # Next.js application
│   ├── app/                 # Next.js App Router pages
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── contexts/        # React context providers
│   │   ├── services/        # API client
│   │   └── utils/           # Utility functions
│   ├── public/              # Static assets
│   └── next.config.js       # Next.js configuration
├── whatsapp-service/        # WhatsApp integration service
├── Dockerfile               # Main Dockerfile
├── Dockerfile.backend       # Backend-specific Dockerfile
├── Dockerfile.frontend      # Frontend-specific Dockerfile
├── docker-compose.yml       # Docker Compose configuration
└── requirements.txt         # Python dependencies
```

## 🚀 Quick Start

### Option 1: Quick Start with Docker (Recommended)

The easiest way to get started is using Docker Compose:

```bash
# Install dependencies
make install

# Start all services (backend + frontend + database)
make dev
```

This will start:
- Backend API on http://localhost:8000
- Frontend (Next.js) on http://localhost:3000
- PostgreSQL database
- Redis cache

Visit http://localhost:3000 to use the application.

### Option 2: Run Locally

#### Prerequisites
- Python 3.8+ (3.11 recommended)
- Node.js 18+
- PostgreSQL (or use Docker Compose which includes it)
- Redis (or use Docker Compose which includes it)

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

3. **Install frontend dependencies:**
```bash
cd frontend
npm install --legacy-peer-deps
cd ..
```

4. **Run the backend server:**
```bash
source venv/bin/activate
uvicorn backend.api.main:app --reload
```

5. **In a separate terminal, run the frontend dev server:**
```bash
cd frontend
npm run dev
```

6. **Visit the app:**
   - Frontend: http://localhost:3000 (Next.js dev server)
   - Backend API: http://localhost:8000


### Database Setup

The application uses PostgreSQL for data storage. If you're using Docker Compose (recommended), the database is automatically set up. For local development without Docker:

1. **Install PostgreSQL** and create a database
2. **Set environment variables:**
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/beachkings"
   ```
3. **Run migrations:**
   ```bash
   make migrate
   # Or manually:
   cd backend && alembic upgrade head
   ```

### Export to Google Sheets (Optional)

The system can export match data to CSV format compatible with Google Sheets. This is useful for backup or analysis in spreadsheets. See the API documentation for export endpoints.

### CI & PR review (Gemini)

A GitHub Action runs [Gemini](https://ai.google.dev/) code review on every pull request. To enable it:

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey).
2. In the repo: **Settings → Secrets and variables → Actions**, add a secret named `GEMINI_API_KEY` with that key.

The workflow (`.github/workflows/gemini-pr-review.yml`) runs on PR open, sync, and reopen, and posts review comments on the PR.

## 🔧 API Endpoints

The FastAPI server exposes these endpoints:

### Main Endpoints

- `POST /api/calculate` - Recalculate all statistics (for database-stored matches)
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

Edit `frontend/src/App.css` to change colors (Note: With Next.js, you may need to import this in your layout or pages):

```css
:root {
  --sunset-orange: #ff6b35;  /* Primary accent */
  --ocean-blue: #4a90a4;     /* Buttons & headers */
  --sand: #f4e4c1;           /* Borders */
  /* ... more color variables */
}
```

### Change Google Sheets Link

Edit the relevant component that displays the Google Sheets link (if applicable).

## 🚢 Deployment

### Docker Deployment

The application uses Docker for containerized deployment. See [DOCKER_SETUP.md](DOCKER_SETUP.md) for detailed instructions.

**Quick deployment:**
```bash
# Build all Docker images
make docker-build

# Start all services
make docker-up

# Or build and start in one command
make start
```

### EC2 Deployment

For deploying to AWS EC2, see [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md) for step-by-step instructions.

### Deployment Details

The app uses Docker for deployment:
- **Backend**: Python 3.11 with FastAPI
- **Frontend**: Next.js 15 (built at container build time)
- **Database**: PostgreSQL
- **Cache**: Redis
- Separate Dockerfiles for backend and frontend for optimized builds

## 📖 Usage

### Database Management

For database operations:

```bash
# Run migrations
make migrate

# Access database directly (if using Docker)
docker exec -it beach-kings-postgres psql -U beachkings -d beachkings
```


## 📚 Additional Documentation

- [APPLICATION_SPEC.md] - Design for app
- [DOCKER_SETUP.md](DOCKER_SETUP.md) - Docker setup and deployment guide
- [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md) - EC2 deployment instructions
- [frontend/README.md](frontend/README.md) - Next.js frontend documentation
- [backend/DATABASE_SCHEMA.md](backend/DATABASE_SCHEMA.md) - Database schema documentation

## 🛠️ Development


## 🤝 Contributing

Track progress and upcoming work on the [project board](https://github.com/users/pschwagler/projects/2).

Feel free to:
- Report bugs
- Suggest features
- Submit pull requests

## 📝 License

Apache 2.0 License - See [LICENSE](LICENSE) file for details.

## 🏆 Credits

Original ELO calculation was based on [google-sheets-elo-system](https://github.com/Eddykasp/google-sheets-elo-system) by Eddykasp.

Extended with:
- Next.js frontend with App Router
- REST API with FastAPI
- PostgreSQL database
- Enhanced statistics
- Docker deployment
- Points system
- Match history tracking
- Partnership and opponent analytics

---

**Built with ❤️ for beach volleyball communities** 🌴🌊
