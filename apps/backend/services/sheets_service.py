"""
Google Sheets service for reading match data.
Read-only - no writing back to sheets.
"""

import os
import json
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
# Note: This service is disabled. If re-enabled, would need to create Match ORM objects
# from backend.database.models import Match

# Google Sheets configuration
CREDENTIALS_FILE = 'credentials.json'
GOOGLE_SHEETS_ID = '1KZhd5prjzDjDTJCvg0b1fxVAM-uGDBxsHJJwKBKrBIA'

scope = ['https://spreadsheets.google.com/feeds',
         'https://www.googleapis.com/auth/drive']


def get_credentials():
    """Get Google Sheets credentials from environment or file."""
    credentials_json = os.getenv('CREDENTIALS_JSON')
    if credentials_json:
        credentials_dict = json.loads(credentials_json)
        return ServiceAccountCredentials.from_json_keyfile_dict(
            credentials_dict, scope)
    else:
        return ServiceAccountCredentials.from_json_keyfile_name(
            CREDENTIALS_FILE, scope)


def load_matches_from_sheets(sheet_id=None):
    """
    DISABLED: This function has been disabled.
    
    TODO: Re-implement to be season-specific and add proper validations.
    This function should:
    - Accept a season_id parameter
    - Validate matches against season constraints
    - Handle data validation and error reporting
    """
    raise NotImplementedError(
        "load_matches_from_sheets has been disabled. "
        "This function needs to be re-implemented to be season-specific with proper validations. "
        "It should accept a season_id parameter and validate matches against season constraints."
    )
    
    credentials = get_credentials()
    gc = gspread.authorize(credentials)
    
    # Try to open by ID first, then by name
    try:
        sh = gc.open_by_key(sheet_id)
    except:
        sh = gc.open(sheet_id)
    
    wks = sh.worksheet("Matches")
    data = wks.get_all_values()
    headers = data.pop(0)
    df = pd.DataFrame(data, columns=headers)
    df.columns = ['DATE', 'T1P1', 'T1P2', 'T2P1', 'T2P2', 'T1SCORE', 'T2SCORE']

    match_list = []
    for _, row in df.iterrows():
        match = MatchData(
            team1_player1=row['T1P1'],
            team1_player2=row['T1P2'],
            team2_player1=row['T2P1'],
            team2_player2=row['T2P2'],
            team1_score=int(row['T1SCORE']),
            team2_score=int(row['T2SCORE']),
            date=row['DATE']
        )
        match_list.append(match)
    
    return match_list
