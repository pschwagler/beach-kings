#!/usr/bin/env python3
"""
Search Google Images for court photos using Custom Search API.

Downloads candidate images for courts that have fewer than 3 photos.
Uses Gemini to pre-filter, then saves to data/court-photos/{slug}/.

Usage:
    python scripts/search_court_photos.py --courts venice-beach-volleyball-courts-venice el-segundo-beach-courts-el-segundo
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

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COURTS_CSV = PROJECT_ROOT / "apps" / "backend" / "seed" / "courts.csv"
OUTPUT_DIR = PROJECT_ROOT / "data" / "court-photos"

load_dotenv(PROJECT_ROOT / ".env")

PLACES_KEY = os.getenv("GOOGLE_PLACES_API_KEY")
GEMINI_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"

# Custom Search API
CUSTOM_SEARCH_URL = "https://www.googleapis.com/customsearch/v1"
# Google Programmable Search Engine for web-wide image search
# cx=partner-pub creates a broad web search; we use searchType=image
SEARCH_CX = os.getenv("GOOGLE_SEARCH_CX", "")

MAX_PHOTOS_TARGET = 3

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

_gemini_client = None


def get_gemini_client():
    """Lazy-initialize Gemini client."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai
        _gemini_client = genai.Client(api_key=GEMINI_KEY)
    return _gemini_client


def load_court_by_slug(slug: str) -> dict | None:
    """Look up a court in courts.csv by slug."""
    with open(COURTS_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["slug"] == slug:
                return row
    return None


def count_existing_photos(slug: str) -> int:
    """Count existing approved photos for a court."""
    court_dir = OUTPUT_DIR / slug
    if not court_dir.exists():
        return 0
    return len([f for f in court_dir.iterdir() if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png"}])


def search_images(query: str, num: int = 10) -> list[str]:
    """
    Search for images using Google Custom Search API.

    Returns list of image URLs.
    """
    if not SEARCH_CX:
        # Fallback: use direct image search URL scraping won't work.
        # Without a CX, we can't use Custom Search API.
        print(f"    WARNING: GOOGLE_SEARCH_CX not set, cannot search images")
        return []

    params = {
        "key": PLACES_KEY,
        "cx": SEARCH_CX,
        "q": query,
        "searchType": "image",
        "num": min(num, 10),
        "imgSize": "large",
        "safe": "active",
    }

    resp = requests.get(CUSTOM_SEARCH_URL, params=params, timeout=15)
    if resp.status_code != 200:
        print(f"    Search API error ({resp.status_code}): {resp.text[:200]}")
        return []

    data = resp.json()
    urls = []
    for item in data.get("items", []):
        url = item.get("link", "")
        if url:
            urls.append(url)
    return urls


def download_image(url: str) -> bytes | None:
    """Download an image from a URL. Returns bytes or None."""
    try:
        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        if resp.status_code != 200:
            return None
        ct = resp.headers.get("content-type", "")
        if not ct.startswith("image/"):
            return None
        if len(resp.content) < 5000:  # Skip tiny images (likely icons)
            return None
        return resp.content
    except Exception:
        return None


def check_photo(img_bytes: bytes) -> tuple[bool, str]:
    """Use Gemini to evaluate a photo. Returns (accepted, reason)."""
    try:
        from google.genai import types
        client = get_gemini_client()
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[types.Content(parts=[
                types.Part.from_text(text=FILTER_PROMPT),
                types.Part.from_bytes(data=img_bytes, mime_type="image/jpeg"),
            ])],
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=200,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        text = response.text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
        parsed = json.loads(text)
        return parsed.get("accept", True), parsed.get("reason", "no reason")
    except Exception as e:
        return True, f"gemini_error: {e}"


def process_court(slug: str, court: dict) -> int:
    """Search for and download photos for a single court."""
    existing = count_existing_photos(slug)
    needed = MAX_PHOTOS_TARGET - existing

    if needed <= 0:
        print(f"  SKIP {slug}: already has {existing} photos")
        return 0

    # Build search query
    name = court["name"]
    address = court["address"]
    query = f"{name} beach volleyball courts {address}"
    print(f"  Searching: {query}")

    urls = search_images(query, num=10)
    if not urls:
        print(f"  NO RESULTS for {slug}")
        return 0

    print(f"  Found {len(urls)} image results")

    court_dir = OUTPUT_DIR / slug
    court_dir.mkdir(parents=True, exist_ok=True)
    rejected_dir = court_dir / "rejected"

    saved = 0
    next_num = existing + 1

    for i, url in enumerate(urls):
        if saved >= needed:
            break

        time.sleep(0.3)
        img_bytes = download_image(url)
        if not img_bytes:
            continue

        time.sleep(0.3)
        accepted, reason = check_photo(img_bytes)

        if not accepted:
            rejected_dir.mkdir(parents=True, exist_ok=True)
            (rejected_dir / f"search_rejected_{i + 1:02d}.jpg").write_bytes(img_bytes)
            print(f"    REJECTED: {reason}")
            continue

        filename = f"{next_num:02d}.jpg"
        (court_dir / filename).write_bytes(img_bytes)
        saved += 1
        next_num += 1
        print(f"    ACCEPTED: {reason}")
        print(f"    Saved {slug}/{filename} ({len(img_bytes) // 1024}KB)")

    return saved


def main():
    parser = argparse.ArgumentParser(description="Search Google Images for court photos")
    parser.add_argument(
        "--courts", nargs="+", required=True,
        help="Court slugs to search for",
    )
    args = parser.parse_args()

    if not SEARCH_CX:
        print("ERROR: GOOGLE_SEARCH_CX not set in .env")
        print("Create a Programmable Search Engine at https://programmablesearchengine.google.com/")
        print("Then add GOOGLE_SEARCH_CX=<your-cx-id> to .env")
        sys.exit(1)

    total_saved = 0
    for slug in args.courts:
        court = load_court_by_slug(slug)
        if not court:
            print(f"  Court not found in CSV: {slug}")
            continue
        print(f"\n{court['name']} ({slug})")
        count = process_court(slug, court)
        total_saved += count

    print(f"\nDone! Saved {total_saved} new photos.")


if __name__ == "__main__":
    main()
