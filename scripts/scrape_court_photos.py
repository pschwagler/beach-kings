#!/usr/bin/env python3
"""
Scrape Google Images for court photos using Playwright + Gemini filtering.

For courts with <3 photos, searches Google Images, extracts full-size image
URLs, downloads candidates, and filters through Gemini.

Usage:
    python scripts/scrape_court_photos.py
"""

import csv
import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

PROJECT_ROOT = Path(__file__).resolve().parent.parent
COURTS_CSV = PROJECT_ROOT / "apps" / "backend" / "seed" / "courts.csv"
OUTPUT_DIR = PROJECT_ROOT / "data" / "court-photos"

load_dotenv(PROJECT_ROOT / ".env")
GEMINI_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash"

MAX_PHOTOS_TARGET = 3
# Check more candidates than needed to account for rejections
CANDIDATES_PER_COURT = 10

PRIORITY_COURTS = [
    "venice-beach-volleyball-courts-venice",
    "el-segundo-beach-courts-el-segundo",
    "marine-street-courts-manhattan-beach",
    "montrose-beach-chicago",
    "crandon-park-beach-key-biscayne",
    "fort-lauderdale-beach-park-fort-lauderdale",
    "lummus-park-miami-beach",
    "kailua-beach-kailua",
    "jones-beach-wantagh",
    "golden-gardens-seattle",
    "alki-beach-seattle",
    "zilker-park-austin",
    "delta-park-portland",
    "desert-breeze-park-las-vegas",
    "bonita-cove-volleyball-courts-san-diego",
    "newport-beach-balboa-pier-courts-newport-beach",
    "piedmont-park-atlanta",
    "edgewater-beach-cleveland",
    "castle-island-boston",
    "wrightsville-beach-park-wrightsville-beach",
    "folly-beach-county-park-folly-beach",
    "chaparral-park-scottsdale",
    "gulf-place-public-beach-gulf-shores",
    "gene-autry-park-mesa",
    "chelsea-piers-fitness",
]

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


def extract_image_urls(page, max_urls: int = 20) -> list[str]:
    """
    Extract image URLs from Google Images page source.

    Scrolls to trigger lazy loading, then extracts external image URLs
    from the page HTML using regex.
    """
    # Scroll to trigger lazy loading of more results
    for _ in range(3):
        page.evaluate("window.scrollBy(0, 1000)")
        time.sleep(0.8)

    html = page.content()

    # Find all external image URLs in the page source
    url_pattern = re.compile(
        r'(https?://[^\s"\\]+\.(?:jpg|jpeg|png|webp))', re.IGNORECASE
    )
    all_urls = url_pattern.findall(html)

    # Filter out Google's own URLs and stock photo sites (watermarked)
    blocked_domains = [
        "google", "gstatic", "encrypted-tbn", "googleapis",
        "depositphotos", "dreamstime", "istockphoto", "gettyimages",
        "shutterstock", "alamy", "123rf", "bigstock", "adobestock",
    ]
    external_urls = []
    for url in all_urls:
        url_lower = url.lower()
        if any(d in url_lower for d in blocked_domains):
            continue
        if len(url) > 500:
            continue
        external_urls.append(url)

    # Deduplicate preserving order
    seen = set()
    unique = []
    for url in external_urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)

    return unique[:max_urls]


def download_image(url: str) -> bytes | None:
    """Download an image from a URL."""
    try:
        resp = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })
        if resp.status_code != 200:
            return None
        ct = resp.headers.get("content-type", "")
        if not ct.startswith("image/"):
            return None
        if len(resp.content) < 10000:  # Skip tiny images
            return None
        return resp.content
    except Exception:
        return None


def check_photo(img_bytes: bytes) -> tuple[bool, str]:
    """Use Gemini to evaluate a photo."""
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


def process_court(page, slug: str, court: dict) -> int:
    """Search Google Images and download filtered photos for a court."""
    existing = count_existing_photos(slug)
    needed = MAX_PHOTOS_TARGET - existing
    if needed <= 0:
        print(f"  SKIP: already has {existing} photos")
        return 0

    name = court["name"]
    address = court["address"]
    query = f"{name} beach volleyball courts {address}"

    # Search Google Images
    search_url = f"https://www.google.com/search?q={quote(query)}&tbm=isch"
    page.goto(search_url, wait_until="networkidle")
    time.sleep(2)

    # Extract image URLs
    urls = extract_image_urls(page)
    if not urls:
        print(f"  NO IMAGE URLS found")
        return 0

    print(f"  Found {len(urls)} candidate URLs")

    court_dir = OUTPUT_DIR / slug
    court_dir.mkdir(parents=True, exist_ok=True)
    rejected_dir = court_dir / "rejected"

    saved = 0
    next_num = existing + 1

    for i, url in enumerate(urls[:CANDIDATES_PER_COURT]):
        if saved >= needed:
            break

        img_bytes = download_image(url)
        if not img_bytes:
            continue

        time.sleep(0.3)
        accepted, reason = check_photo(img_bytes)

        if not accepted:
            rejected_dir.mkdir(parents=True, exist_ok=True)
            (rejected_dir / f"web_{i + 1:02d}.jpg").write_bytes(img_bytes)
            print(f"    REJECTED: {reason}")
            continue

        filename = f"{next_num:02d}.jpg"
        (court_dir / filename).write_bytes(img_bytes)
        saved += 1
        next_num += 1
        print(f"    SAVED {slug}/{filename} ({len(img_bytes) // 1024}KB): {reason}")

    return saved


def load_all_courts() -> list[dict]:
    """Load all courts from CSV."""
    with open(COURTS_CSV, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    """Scrape Google Images for courts needing photos (<3)."""
    all_courts = load_all_courts()

    # Build work list: courts needing photos, priority courts first
    priority_set = set(PRIORITY_COURTS)
    needs_photos = []
    for court in all_courts:
        slug = court["slug"]
        existing = count_existing_photos(slug)
        if existing < MAX_PHOTOS_TARGET:
            needs_photos.append((court, existing))

    # Sort: priority courts first (in PRIORITY_COURTS order), then the rest
    priority_order = {s: i for i, s in enumerate(PRIORITY_COURTS)}
    needs_photos.sort(key=lambda x: priority_order.get(x[0]["slug"], 999))

    print(f"Found {len(needs_photos)} courts needing photos")
    total_saved = 0
    total_courts = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        for court, existing in needs_photos:
            slug = court["slug"]
            total_courts += 1
            print(f"\n[{total_courts}/{len(needs_photos)}] {court['name']} ({slug}) — has {existing}, needs {MAX_PHOTOS_TARGET - existing}")
            count = process_court(page, slug, court)
            total_saved += count
            time.sleep(1)

        browser.close()

    print(f"\nDone! Saved {total_saved} photos for {total_courts} courts.")


if __name__ == "__main__":
    main()
