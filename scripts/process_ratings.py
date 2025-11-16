#!/usr/bin/env python3
"""
Process third-party player ratings from AVP and TruVolley APIs.

This script:
1. Fetches player data from AVP and TruVolley APIs
2. Deduplicates by keeping highest-ranked players per name
3. Merges the datasets on player name
4. Writes the result to a JSON file

Usage:
    python scripts/process_ratings.py
"""

import json
import sys
from pathlib import Path

import httpx
import numpy as np
import pandas as pd


# API endpoints
AVP_API_URL = "https://volleyballlife-api-dot-net-8.azurewebsites.net/ranking/new/33"
TRUVOLLEY_API_URL = "https://truvolley.com/api/v1/ratings"

# Output directory and file
# Get the project root (parent of scripts directory)
PROJECT_ROOT = Path(__file__).parent.parent
THIRDPARTY_DIR = PROJECT_ROOT / "thirdparty"
OUTPUT_FILE = THIRDPARTY_DIR / "merged-player-ratings.json"


def fetch_avp_data():
    """Fetch player data from AVP API."""
    print("Fetching AVP data...")
    response = httpx.get(AVP_API_URL, timeout=30.0)
    response.raise_for_status()
    data = response.json()
    
    # Extract players array from response
    if isinstance(data, dict) and "players" in data:
        players = data["players"]
    elif isinstance(data, list):
        players = data
    else:
        raise ValueError("Unexpected AVP API response format")
    
    print(f"  Fetched {len(players)} AVP players")
    return players


def fetch_truvolley_data():
    """Fetch player data from TruVolley API."""
    print("Fetching TruVolley data...")
    response = httpx.get(TRUVOLLEY_API_URL, timeout=30.0)
    response.raise_for_status()
    data = response.json()
    
    # TruVolley API returns a list directly
    if isinstance(data, list):
        players = data
    else:
        raise ValueError("Unexpected TruVolley API response format")
    
    print(f"  Fetched {len(players)} TruVolley players")
    return players


def deduplicate_avp(df_avp):
    """Deduplicate AVP DataFrame by keeping player with highest points per name."""
    print("\nDeduplicating AVP data...")
    print(f"  Original rows: {len(df_avp)}")
    
    # Sort by points descending and keep first occurrence of each name
    df_unique = df_avp.sort_values('points', ascending=False).drop_duplicates(
        subset='name', 
        keep='first'
    )
    
    print(f"  Unique names: {df_avp['name'].nunique()}")
    print(f"  Deduplicated rows: {len(df_unique)}")
    
    # Add gender-based ranking by points
    # Rank within each gender group (higher points = better rank, so rank 1 is best)
    # Name it 'gender_rank' so it becomes 'avp_gender_rank' after prefixing
    df_unique['gender_rank'] = df_unique.groupby('isMale')['points'].rank(
        method='min', 
        ascending=False
    ).astype(int)
    
    print(f"  Added gender-based ranking (rank 1 = highest points in gender)")
    
    return df_unique


def deduplicate_truvolley(df_tv):
    """Deduplicate TruVolley DataFrame by keeping best-ranked player per name."""
    print("\nDeduplicating TruVolley data...")
    print(f"  Original rows: {len(df_tv)}")
    
    # Create sort key: use global_rank if available (lower is better),
    # otherwise use negative seeding_rating for sorting
    df_unique = df_tv.copy()
    df_unique['_sort_rank'] = df_unique['global_rank'].fillna(999999)
    
    # Sort by rank (ascending) and seeding_rating (descending), then drop duplicates
    df_unique = df_unique.sort_values(
        ['_sort_rank', 'seeding_rating'], 
        ascending=[True, False]
    ).drop_duplicates(subset='name', keep='first')
    
    # Remove temporary sort column
    df_unique = df_unique.drop(columns=['_sort_rank'])
    
    print(f"  Unique names: {df_tv['name'].nunique()}")
    print(f"  Deduplicated rows: {len(df_unique)}")
    
    return df_unique


def merge_datasets(df_avp_unique, df_tv_unique):
    """Merge AVP and TruVolley DataFrames with column prefixes."""
    print("\nMerging datasets...")
    
    # Rename columns with prefixes (except 'name')
    df_avp_renamed = df_avp_unique.copy()
    df_avp_renamed.columns = [
        'avp_' + col if col != 'name' else col 
        for col in df_avp_renamed.columns
    ]
    
    # Rename TruVolley columns with 'tv_' prefix, but skip 'name' and 'tv_id' 
    # (since tv_id already has the tv prefix in the column name)
    df_tv_renamed = df_tv_unique.copy()
    df_tv_renamed.columns = [
        'tv_' + col if col not in ['name', 'tv_id'] else col 
        for col in df_tv_renamed.columns
    ]
    
    # Merge on name
    df_final = df_avp_renamed.merge(
        df_tv_renamed,
        on='name',
        how='left'
    )
    
    print(f"  AVP unique rows: {len(df_avp_unique)}")
    print(f"  TruVolley unique rows: {len(df_tv_unique)}")
    print(f"  Final merged rows: {len(df_final)}")
    print(f"  Rows with TruVolley match: {df_final['tv_id'].notna().sum()}")
    print(f"  Rows without TruVolley match: {df_final['tv_id'].isna().sum()}")
    print(f"  Match rate: {df_final['tv_id'].notna().sum() / len(df_final) * 100:.2f}%")
    
    return df_final


def write_output(df_final, output_file):
    """Write merged DataFrame to JSON file."""
    print(f"\nWriting output to {output_file}...")
    
    # Create output directory if it doesn't exist
    output_file.parent.mkdir(parents=True, exist_ok=True)
    
    # Convert DataFrame to list of dictionaries
    # Replace all NaN types with None for proper JSON serialization (None -> null in JSON)
    records = df_final.replace({
        pd.NA: None,
        pd.NaT: None,
        np.nan: None,
        float('nan'): None
    }).to_dict('records')
    
    # Also ensure any remaining NaN values in the records are converted to None
    # This handles cases where NaN might still exist in nested structures
    def convert_nan_to_none(obj):
        """Recursively convert NaN values to None."""
        if isinstance(obj, dict):
            return {key: convert_nan_to_none(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [convert_nan_to_none(item) for item in obj]
        elif pd.isna(obj) if hasattr(pd, 'isna') else (obj != obj):  # NaN check
            return None
        return obj
    
    records = convert_nan_to_none(records)
    
    # Write to file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(records, f, indent=2, ensure_ascii=False)
    
    print(f"  Wrote {len(records)} records to {output_file}")
    print(f"  File size: {output_file.stat().st_size / 1024 / 1024:.2f} MB")


def main():
    """Main execution function."""
    print("=" * 60)
    print("Processing Third-Party Player Ratings")
    print("=" * 60)
    
    try:
        # Fetch data from APIs
        avp_data = fetch_avp_data()
        truvolley_data = fetch_truvolley_data()
        
        # Convert to DataFrames
        print("\nConverting to DataFrames...")
        df_avp = pd.DataFrame(avp_data)
        df_tv = pd.DataFrame(truvolley_data)
        
        # Deduplicate
        df_avp_unique = deduplicate_avp(df_avp)
        df_tv_unique = deduplicate_truvolley(df_tv)
        
        # Merge datasets
        df_final = merge_datasets(df_avp_unique, df_tv_unique)
        
        # Write output
        write_output(df_final, OUTPUT_FILE)
        
        print("\n" + "=" * 60)
        print("Processing complete!")
        print("=" * 60)
        
        return 0
        
    except httpx.HTTPError as e:
        print(f"\nError fetching data from API: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"\nError processing data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

