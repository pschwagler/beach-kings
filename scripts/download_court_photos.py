#!/usr/bin/env python3
"""
Download court photos from Google Places API for all seeded courts.

For each court in courts.csv:
  1. Searches Google Places (New) by name + coordinates
  2. Downloads up to N candidate photos per court
  3. Filters each photo through Gemini vision to check relevance
  4. Saves approved photos to data/court-photos/{slug}/

Gemini filter rejects:
  - Building exteriors, signage, parking lots
  - Close-ups of people / faces
  - Empty sand/fields without courts or nets
  - Food, menus, interiors unrelated to volleyball

Idempotent: skips courts that already have a photo directory with images.
Use --force to re-download.

Usage:
    # Download up to 5 photos per court (default)
    python scripts/download_court_photos.py

    # Download up to 3 photos per court
    python scripts/download_court_photos.py --max-photos 3

    # Re-download even if photos already exist
    python scripts/download_court_photos.py --force

    # Only process specific location(s)
    python scripts/download_court_photos.py --location socal_la --location socal_sd

    # Dry run — show what would be downloaded without downloading
    python scripts/download_court_photos.py --dry-run

    # Skip Gemini filter (save everything)
    python scripts/download_court_photos.py --no-filter

Requires:
    GOOGLE_PLACES_API_KEY in .env (or as environment variable)
    GEMINI_API_KEY in .env (for photo filtering)
    pip install requests python-dotenv
"""

import argparse
import csv
import json
import os
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

# ── Config ───────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COURTS_CSV = PROJECT_ROOT / "apps" / "backend" / "seed" / "courts.csv"
OUTPUT_DIR = PROJECT_ROOT / "data" / "court-photos"
# Rejected photos go in a "rejected/" subfolder within each court's directory
DEFAULT_MAX_PHOTOS = 5

# To get N good photos, we may need to evaluate more candidates
CANDIDATE_MULTIPLIER = 2

# Google Places API (New) endpoints
PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_PHOTO_URL = "https://places.googleapis.com/v1/{name}/media"

# Gemini model (same as photo_match_service)
GEMINI_MODEL = "gemini-2.5-flash"

# Rate limiting
REQUEST_DELAY_SECONDS = 0.3
GEMINI_DELAY_SECONDS = 0.3

# ── Gemini prompt ────────────────────────────────────────────────────────────

FILTER_PROMPT = """\
You are evaluating a photo for a beach/sand volleyball court listing page.

ACCEPT photos that show:
- Volleyball courts (sand, grass, or indoor) — with or without players
- Wide/medium shots that convey the vibe and atmosphere of the venue
- Nets, poles, court lines, sand areas clearly meant for volleyball
- Players in action at a reasonable distance (not close-ups)
- Scenic views of the court area and surroundings

REJECT photos that show:
- Building exteriors, storefronts, signage, or parking lots
- Close-up shots of people's faces or small groups posing
- Food, drinks, menus, or restaurant/bar interiors
- Empty sand or grass with no volleyball infrastructure visible
- Logos, flyers, screenshots, or non-photographic content
- Blurry, dark, or very low quality images
- Images with watermarks, stock photo overlays, or photographer branding

Respond with ONLY a JSON object (no markdown):
{"accept": true/false, "reason": "brief explanation"}
"""


def load_api_keys() -> tuple[str, str | None]:
    """Load API keys from .env or environment."""
    load_dotenv(PROJECT_ROOT / ".env")

    places_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if not places_key:
        print("ERROR: GOOGLE_PLACES_API_KEY not set in .env or environment.")
        print("Add it to your .env file: GOOGLE_PLACES_API_KEY=AIza...")
        sys.exit(1)

    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return places_key, gemini_key


def load_courts(location_filter: list[str] | None = None) -> list[dict]:
    """Load courts from CSV, optionally filtered by location_id."""
    courts = []
    with open(COURTS_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if location_filter and row["location_id"] not in location_filter:
                continue
            courts.append(row)
    return courts


def search_place(api_key: str, court: dict) -> dict | None:
    """
    Search Google Places for a court by name and location bias.

    Returns the top place result or None if no match found.
    """
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
    }
    body = {
        "textQuery": f"{court['name']} Beach Volleyball Courts, {court['address']}",
        "locationBias": {
            "circle": {
                "center": {
                    "latitude": float(court["latitude"]),
                    "longitude": float(court["longitude"]),
                },
                "radius": 500.0,
            }
        },
        "maxResultCount": 1,
    }

    resp = requests.post(PLACES_SEARCH_URL, json=body, headers=headers, timeout=15)
    if resp.status_code != 200:
        print(f"    Places search failed ({resp.status_code}): {resp.text[:200]}")
        return None

    data = resp.json()
    places = data.get("places", [])
    return places[0] if places else None


def download_photo(api_key: str, photo_name: str, max_width: int = 1200) -> bytes | None:
    """
    Download a photo from Google Places Photos API.

    Args:
        api_key: Google API key
        photo_name: Photo resource name (e.g., places/xxx/photos/yyy)
        max_width: Max pixel width for the downloaded image

    Returns:
        Image bytes or None on failure.
    """
    url = PLACES_PHOTO_URL.format(name=photo_name)
    params = {
        "maxWidthPx": max_width,
        "skipHttpRedirect": "true",
        "key": api_key,
    }

    resp = requests.get(url, params=params, timeout=15)
    if resp.status_code != 200:
        print(f"    Photo metadata failed ({resp.status_code}): {resp.text[:200]}")
        return None

    photo_data = resp.json()
    photo_uri = photo_data.get("photoUri")
    if not photo_uri:
        print("    No photoUri in response")
        return None

    img_resp = requests.get(photo_uri, timeout=30)
    if img_resp.status_code != 200:
        print(f"    Image download failed ({img_resp.status_code})")
        return None

    return img_resp.content


def _get_gemini_client(gemini_key: str):
    """Lazy-initialize the Gemini client (same pattern as photo_match_service)."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=gemini_key)
    return _gemini_client


_gemini_client = None


def check_photo_relevance(gemini_key: str, img_bytes: bytes) -> tuple[bool, str]:
    """
    Use Gemini vision to determine if a photo is a good volleyball court image.

    Args:
        gemini_key: Gemini API key
        img_bytes: Raw image bytes

    Returns:
        (accepted, reason) tuple
    """
    try:
        from google.genai import types

        client = _get_gemini_client(gemini_key)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Content(
                    parts=[
                        types.Part.from_text(text=FILTER_PROMPT),
                        types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=200,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )

        text = response.text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            # Remove first line (```json) and last line (```)
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            text = text.strip()
        parsed = json.loads(text)
        return parsed.get("accept", True), parsed.get("reason", "no reason")
    except json.JSONDecodeError as e:
        print(f"    Gemini parse error ({e}), accepting by default")
        return True, "parse_error"
    except Exception as e:
        print(f"    Gemini error ({e}), accepting by default")
        return True, "gemini_error"


def process_court(
    places_key: str,
    gemini_key: str | None,
    court: dict,
    max_photos: int,
    dry_run: bool = False,
    use_filter: bool = True,
) -> int:
    """
    Find, filter, and download photos for a single court.

    Downloads more candidates than max_photos to account for Gemini rejections.
    Returns the number of photos saved.
    """
    slug = court["slug"]
    court_dir = OUTPUT_DIR / slug

    # Check if already processed (ignore rejected/ subfolder)
    if court_dir.exists() and not dry_run:
        existing = [f for f in court_dir.iterdir() if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png"}]
        if existing:
            print(f"  SKIP {slug}: {len(existing)} photos already exist (use --force)")
            return 0

    # Search for the place
    place = search_place(places_key, court)
    if not place:
        print(f"  NO MATCH: {court['name']}")
        return 0

    photos = place.get("photos", [])
    if not photos:
        print(f"  NO PHOTOS: {court['name']}")
        return 0

    # Evaluate more candidates than we need to account for rejections
    candidates_to_check = min(len(photos), max_photos * CANDIDATE_MULTIPLIER)
    print(f"  FOUND {len(photos)} photos for {court['name']} (checking {candidates_to_check})")

    if dry_run:
        return min(len(photos), max_photos)

    court_dir.mkdir(parents=True, exist_ok=True)
    rejected_dir = court_dir / "rejected"

    saved = 0
    checked = 0

    for photo in photos[:candidates_to_check]:
        if saved >= max_photos:
            break

        photo_name = photo.get("name")
        if not photo_name:
            continue

        time.sleep(REQUEST_DELAY_SECONDS)
        img_bytes = download_photo(places_key, photo_name)
        if not img_bytes:
            continue

        checked += 1

        # Gemini filter
        if use_filter and gemini_key:
            time.sleep(GEMINI_DELAY_SECONDS)
            accepted, reason = check_photo_relevance(gemini_key, img_bytes)
            if not accepted:
                # Save rejected photos separately for review
                rejected_dir.mkdir(parents=True, exist_ok=True)
                rej_filename = f"rejected_{checked:02d}.jpg"
                (rejected_dir / rej_filename).write_bytes(img_bytes)
                print(f"    REJECTED #{checked}: {reason}")
                continue
            print(f"    ACCEPTED #{checked}: {reason}")

        filename = f"{saved + 1:02d}.jpg"
        filepath = court_dir / filename
        filepath.write_bytes(img_bytes)
        saved += 1
        print(f"    Saved {slug}/{filename} ({len(img_bytes) // 1024}KB)")

    if saved == 0 and court_dir.exists() and not list(court_dir.iterdir()):
        court_dir.rmdir()

    return saved


def main():
    """Download court photos from Google Places API with Gemini filtering."""
    parser = argparse.ArgumentParser(description="Download court photos from Google Places API")
    parser.add_argument(
        "--max-photos",
        type=int,
        default=DEFAULT_MAX_PHOTOS,
        help=f"Max photos to keep per court (default: {DEFAULT_MAX_PHOTOS})",
    )
    parser.add_argument(
        "--location",
        action="append",
        dest="locations",
        help="Only process courts in these location(s). Can be repeated.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download even if photos already exist",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be downloaded without downloading",
    )
    parser.add_argument(
        "--no-filter",
        action="store_true",
        help="Skip Gemini filter — save all downloaded photos",
    )
    args = parser.parse_args()

    places_key, gemini_key = load_api_keys()

    use_filter = not args.no_filter
    if use_filter and not gemini_key:
        print("WARNING: GEMINI_API_KEY not set — skipping photo filter.")
        print("All downloaded photos will be saved. Use --no-filter to suppress this warning.\n")
        use_filter = False

    courts = load_courts(args.locations)
    print(f"Processing {len(courts)} courts (max {args.max_photos} photos each)")
    if use_filter:
        print(f"Gemini filter: ON (checking up to {args.max_photos * CANDIDATE_MULTIPLIER} candidates per court)")
    else:
        print("Gemini filter: OFF")
    print()

    if args.force:
        print("--force: will re-download all photos\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total_saved = 0
    total_skipped = 0
    total_no_photos = 0

    for court in courts:
        if args.force:
            court_dir = OUTPUT_DIR / court["slug"]
            if court_dir.exists():
                rejected_dir = court_dir / "rejected"
                if rejected_dir.exists():
                    for f in rejected_dir.iterdir():
                        f.unlink()
                    rejected_dir.rmdir()
                for f in court_dir.iterdir():
                    if f.is_file():
                        f.unlink()

        count = process_court(
            places_key, gemini_key, court, args.max_photos, args.dry_run, use_filter
        )
        if count > 0:
            total_saved += count
        else:
            court_dir = OUTPUT_DIR / court["slug"]
            if court_dir.exists() and list(court_dir.iterdir()):
                total_skipped += 1
            else:
                total_no_photos += 1

        time.sleep(REQUEST_DELAY_SECONDS)

    print(f"\nDone!")
    print(f"  Saved: {total_saved} photos")
    print(f"  Skipped (already exist): {total_skipped} courts")
    print(f"  No photos found: {total_no_photos} courts")
    if args.dry_run:
        print("  (dry run — nothing was actually downloaded)")
    else:
        print(f"\nPhotos saved to: {OUTPUT_DIR}")
        if use_filter:
            print("Rejected photos in: {slug}/rejected/ subfolders")
            print("(Check rejected folders — Gemini may have been too aggressive)")
        print("\nReview the folders, delete any you don't want, then run:")
        print("  python scripts/upload_court_photos.py")


if __name__ == "__main__":
    main()
