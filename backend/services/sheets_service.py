"""
Google Sheets service for reading match data.
Read-only - no writing back to sheets.
"""

import os
import json
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from backend.models.match import Match

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
    Load matches from Google Sheets.
    
    Args:
        sheet_id: Google Sheets ID or name (optional, uses default if not provided)
        
    Returns:
        List of Match objects
    """
    if sheet_id is None:
        sheet_id = GOOGLE_SHEETS_ID
    
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
        match = Match(
            row['T1P1'],
            row['T1P2'],
            row['T2P1'],
            row['T2P2'],
            [row['T1SCORE'], row['T2SCORE']],
            row['DATE']
        )
        match_list.append(match)
    
    return match_list

