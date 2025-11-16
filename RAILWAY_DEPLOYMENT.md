# Railway Deployment Guide

This guide will help you deploy the Beach Volleyball ELO API to Railway.app.

## Prerequisites

- GitHub account
- Railway.app account (free tier is fine)
- Google Sheets API credentials (credentials.json)

## Local Testing (Optional)

Test the API locally before deploying:

```bash
# Install Python dependencies
pip install -r requirements.txt

# Build React frontend
cd frontend
npm install
npm run build
cd ..

# Or use the build script
bash build.sh

# Run the server
uvicorn api:app --reload

# Visit http://localhost:8000 to see the React web interface
# Visit http://localhost:8000/docs for API documentation
```

### Development Mode (React with Hot Reload)

For frontend development with hot reloading:

```bash
# Terminal 1: Run API backend
uvicorn api:app --reload

# Terminal 2: Run React dev server
cd frontend
npm run dev
# Visit http://localhost:3000
```

## Deployment Steps

### 1. Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Add FastAPI server for Railway deployment"

# Add your GitHub remote (replace with your repo URL)
git remote add origin https://github.com/yourusername/beach-volleyball-elo.git

# Push to GitHub
git push -u origin main
```

### 2. Create Railway Project

1. Go to [Railway.app](https://railway.app)
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `beach-volleyball-elo` repository
5. Railway will automatically detect the Python app

### 3. Configure Environment Variables

In Railway dashboard:

1. Go to your project
2. Click on "Variables" tab
3. Add the following variables:

**CREDENTIALS_JSON:**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  ...
}
```
(Copy the entire contents of your `credentials.json` file)

**Optional - if you want to override the sheet ID:**
```
GOOGLE_SHEETS_ID=your_sheet_id_here
```

### 4. Deploy

Railway will automatically deploy your app. The deployment process:

1. Detects Python
2. Installs dependencies from `requirements.txt`
3. Runs the command from `Procfile`
4. Assigns a public URL

### 5. Get Your App URL

1. In Railway dashboard, go to "Settings"
2. Under "Domains", you'll see your public URL
3. Click "Generate Domain" if not already done
4. Your app will be available at: `https://your-app-name.railway.app`

## Using the API

### Web Interface

Visit your Railway URL to access the web interface:
- `https://your-app-name.railway.app/`

### API Endpoints

- `POST /api/calculate` - Recalculate stats from Google Sheets
- `GET /api/rankings` - Get current rankings
- `GET /api/players/{name}` - Get player details
- `GET /api/elo-timeline` - Get ELO history for graphing
- `GET /api/health` - Health check

### API Documentation

Visit `https://your-app-name.railway.app/docs` for interactive API documentation.

## First Time Usage

1. Visit your Railway app URL
2. Click "Recalculate Stats" button
3. Wait for calculation to complete (reads from Google Sheets)
4. View rankings and player details

## Updating the App

Whenever you push changes to GitHub, Railway will automatically redeploy:

```bash
git add .
git commit -m "Your changes"
git push
```

## Troubleshooting

### App won't start

1. Check Railway logs in the dashboard
2. Verify `credentials.json` environment variable is set correctly
3. Make sure Google Sheets API is enabled in Google Cloud Console

### Can't load data

1. Click "Recalculate Stats" to pull fresh data from Google Sheets
2. Check that credentials have access to the Google Sheet
3. Verify the sheet ID in `match.py` is correct

### Out of free tier hours

Railway free tier: 500 hours/month (plenty for personal use)
- If you run out, upgrade to a paid plan ($5/month)
- Or use Render.com (750 hours/month free)

## Cost

- Railway free tier: $0/month (500 hours)
- Enough for: ~16 hours/day of uptime
- Perfect for personal/team use

## Next Steps

- Add custom domain (optional)
- Set up authentication (if needed)
- Add more API endpoints
- Migrate to database (if data grows large)

## Support

If you have issues:
1. Check Railway logs
2. Test locally first with `uvicorn api:app --reload`
3. Verify Google Sheets credentials are correct

