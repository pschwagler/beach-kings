# Setting Up Google Sheets Credentials

## Quick Setup Guide

Your `match.py` file is already configured to use:
- **Google Sheet ID**: `1KZhd5prjzDjDTJCvg0b1fxVAM-uGDBxsHJJwKBKrBIA`
- **Credentials file**: `credentials.json` (needs to be created)

## Steps to Get Your Credentials

1. **Create a Google Cloud Project** (if you don't have one):
   - Go to https://console.cloud.google.com/
   - Create a new project or select an existing one

2. **Enable Google Sheets API**:
   - In the Google Cloud Console, go to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and enable it
   - Also enable "Google Drive API"

3. **Create a Service Account**:
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Give it a name (e.g., "elo-tracker")
   - Click "Create and Continue"
   - Skip role assignment for now, click "Continue"
   - Click "Done"

4. **Generate JSON Key**:
   - Click on the service account you just created
   - Go to the "Keys" tab
   - Click "Add Key" > "Create New Key"
   - Select "JSON" format
   - Click "Create"
   - The JSON file will download automatically

5. **Rename and Place the Credentials File**:
   - Rename the downloaded file to `credentials.json`
   - Place it in the project directory (`/Users/patrick/repos/beach-volleyball-elo/`)

6. **Share Your Google Sheet with the Service Account**:
   - Open your Google Sheet: https://docs.google.com/spreadsheets/d/1KZhd5prjzDjDTJCvg0b1fxVAM-uGDBxsHJJwKBKrBIA/edit
   - Click the "Share" button
   - Copy the service account email from the JSON file (look for `"client_email"` field)
   - Paste the email in the share dialog
   - Give it "Editor" access
   - Click "Send"

7. **Test the Setup**:
   ```bash
   source venv/bin/activate
   python match.py
   ```

## Security Note

⚠️ **Important**: The `credentials.json` file contains sensitive information. Do NOT commit it to version control.

The `.gitignore` file is already configured to exclude this file, but make sure you never share it publicly.


