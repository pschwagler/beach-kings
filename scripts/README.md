# Beach League Scripts

This directory contains utility scripts for managing players and importing match data.

## Scripts

### 1. `setup_players.py` - Player Onboarding

Complete script to set up players: signup, verify phone, and update profile.

**Usage:**
```bash
python scripts/setup_players.py
```

**What it does:**
- Signs up players with their phone numbers and passwords
- Verifies phone numbers (reads verification codes from database)
- Updates player profiles with nickname, gender, and level
- Handles existing users gracefully

**Configuration:**
- Edit the `PLAYERS` list to add/remove players
- Set `DEFAULT_PASSWORD` for all accounts
- Set `GENDER` and `LEVEL` for all players
- Adjust `API_BASE_URL` if needed (default: http://localhost:8000)

**Environment Variables:**
- `API_BASE_URL` - API endpoint (default: http://localhost:8000)
- `DATABASE_URL` - PostgreSQL connection string
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`

**Notes:**
- Rate limited to avoid exceeding 10 verification requests per minute
- Automatically waits 7 seconds between players
- You'll need to fill in phone numbers for Pat, Stanley, and Hayden (marked with `+1??????????`)

---

### 2. `import_matches.py` - Match Data Import

Import historical match data from CSV into a specific league (matches will be associated with the league's active season).

**Usage:**
```bash
# Get authentication token first
python scripts/import_matches.py <league_id> <csv_file> --token <your_token>

# Or set as environment variable
export API_TOKEN="your_token_here"
python scripts/import_matches.py <league_id> <csv_file>

# With custom API URL
python scripts/import_matches.py <league_id> <csv_file> --token <your_token> --url http://api.example.com
```

**Example:**
```bash
python scripts/import_matches.py 1 scripts/matches.csv --token eyJ...
```

**Options:**
- `league_id` - (Required) ID of the league to import matches into
- `csv_file` - (Required) Path to CSV file with match data
- `--token` - Authentication token (or use `API_TOKEN` environment variable)
- `--url` - API base URL (default: http://localhost:8000 or `API_BASE_URL` environment variable)
- `--no-submit` - Don't automatically submit sessions after creating matches

**CSV Format:**
```csv
Date,Team1_P1,Team1_P2,Team2_P1,Team2_P2,Team1_Score,Team2_Score
11/4/2025,Roger,Dedo,Colan,Connor,21,15
11/4/2025,Dan,Ken,Pat,Kevin,21,19
```

**Features:**
- Automatically creates sessions for each unique date
- Groups matches by date
- Handles multiple date formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
- Automatically submits sessions to trigger stats calculation
- Reports success/failure for each match

**Getting an Auth Token:**
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone_number": "+1234567890", "password": "yourpassword"}'
```

The response will include an `access_token` field - use that value for the `--token` parameter.

---

## Sample Data

### `matches.csv`

Sample CSV file with 62 matches from November-December 2025. This file contains real match data and can be used to test the import script or as a template for your own data.

**Player Name Mapping:**
The script includes a `PLAYER_MAPPING` dictionary that maps nicknames (from CSV) to full names (in database). Edit this mapping in `import_matches.py` to match your players.

**To use:**
1. First, create a league and season via the API or UI
2. Note the league ID
3. Edit the `PLAYER_MAPPING` in the script if needed
4. Run the import script:
   ```bash
   python scripts/import_matches.py <league_id> scripts/matches.csv --token <your_token>
   ```

---

## Common Workflows

### Initial Setup (New League)

1. **Set up players:**
   ```bash
   # Edit PLAYERS list in setup_players.py first
   python scripts/setup_players.py
   ```

2. **Create league and season via API or UI**

3. **Import historical matches:**
   ```bash
   # Get your auth token
   export API_TOKEN="your_token"
   
   # Import matches (use your league ID)
   python scripts/import_matches.py <league_id> scripts/matches.csv
   ```

### Adding New Players

1. Add player info to `PLAYERS` list in `setup_players.py`
2. Run: `python scripts/setup_players.py`
3. Script will skip existing players and only create new ones

### Importing More Matches

1. Create a CSV file with your match data (use `matches.csv` as template)
2. Run: `python scripts/import_matches.py <league_id> your_matches.csv --token <token>`

---

## Troubleshooting

### Rate Limiting
- `setup_players.py` waits 7 seconds between players (verify-phone is limited to 10/minute)
- `import_matches.py` waits 0.5 seconds between dates

### Authentication Errors
- Make sure your token is valid and not expired
- Tokens expire after 30 minutes - get a new one if needed

### Player Name Matching
- The import script uses player nicknames (not full names)
- Make sure nicknames in CSV match those in the database
- Check for typos or variations in spelling

### Database Connection Issues
- Verify `DATABASE_URL` or individual Postgres env vars are set correctly
- Make sure the database is running and accessible

---

## Development

### Adding New Players to setup_players.py

Edit the `PLAYERS` list around line 23:

```python
PLAYERS = [
    {"full_name": "Full Name", "phone": "+1234567890", "nickname": "Nick"},
    # ... more players
]
```

### Testing import_matches.py

Create a small test CSV with 2-3 matches:

```csv
Date,Team1_P1,Team1_P2,Team2_P1,Team2_P2,Team1_Score,Team2_Score
11/4/2025,Roger,Dedo,Colan,Connor,21,15
11/4/2025,Dan,Ken,Pat,Kevin,21,19
```

Then run with `--no-submit` to avoid triggering stats calculations:

```bash
python scripts/import_matches.py <league_id> test.csv --token <token> --no-submit
```

