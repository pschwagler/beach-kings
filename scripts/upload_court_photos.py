#!/usr/bin/env python3
"""
Upload local court photos via the API.

Reads photos from data/court-photos/{slug}/ and for each:
  1. Resolves slug → court_id via GET /api/public/courts
  2. Uploads .jpg/.jpeg/.png/.webp files via POST /api/courts/{court_id}/photos
  3. Skips the "rejected/" subfolder in each court directory

Requires a valid auth token (verified player). Get one with:
    make dev-login ID=1

Usage:
    python scripts/upload_court_photos.py --token <JWT_TOKEN>
    python scripts/upload_court_photos.py --token <JWT_TOKEN> --base-url http://localhost:8000
"""

import argparse
import sys
from pathlib import Path

import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PHOTOS_DIR = PROJECT_ROOT / "data" / "court-photos"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
DEFAULT_BASE_URL = "http://localhost:8000"


def get_slug_to_id_map(base_url: str) -> dict[str, int]:
    """Fetch all courts from the public API and build a slug → id map."""
    slug_map = {}
    page = 1
    while True:
        resp = requests.get(
            f"{base_url}/api/public/courts",
            params={"page": page, "page_size": 100},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        for court in data["items"]:
            slug_map[court["slug"]] = court["id"]
        if page * 100 >= data["total_count"]:
            break
        page += 1
    return slug_map


def upload_photo(base_url: str, token: str, court_id: int, photo_path: Path) -> bool:
    """
    Upload a single photo via POST /api/courts/{court_id}/photos.

    Returns True on success, False on failure.
    """
    content_type_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    ct = content_type_map.get(photo_path.suffix.lower(), "image/jpeg")

    with open(photo_path, "rb") as f:
        resp = requests.post(
            f"{base_url}/api/courts/{court_id}/photos",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (photo_path.name, f, ct)},
            timeout=30,
        )

    if resp.status_code == 200:
        return True
    else:
        print(f"    FAILED ({resp.status_code}): {resp.text[:200]}")
        return False


def main():
    """Upload court photos from data/court-photos/ via the API."""
    parser = argparse.ArgumentParser(description="Upload court photos via API")
    parser.add_argument(
        "--token", required=True,
        help="JWT access token (get one with: make dev-login ID=1)",
    )
    parser.add_argument(
        "--base-url", default=DEFAULT_BASE_URL,
        help=f"Backend base URL (default: {DEFAULT_BASE_URL})",
    )
    args = parser.parse_args()

    if not PHOTOS_DIR.exists():
        print(f"Photos directory not found: {PHOTOS_DIR}")
        sys.exit(1)

    # Build slug → court_id map
    print("Fetching court list...")
    slug_map = get_slug_to_id_map(args.base_url)
    print(f"Found {len(slug_map)} courts in the database\n")

    court_dirs = sorted(
        d for d in PHOTOS_DIR.iterdir()
        if d.is_dir() and d.name != ".DS_Store"
    )
    print(f"Found {len(court_dirs)} court directories in {PHOTOS_DIR}\n")

    total_uploaded = 0
    total_skipped = 0
    total_failed = 0

    for court_dir in court_dirs:
        slug = court_dir.name
        court_id = slug_map.get(slug)

        if court_id is None:
            print(f"SKIP {slug}: no court found with this slug")
            total_skipped += 1
            continue

        photos = sorted(
            f for f in court_dir.iterdir()
            if f.is_file() and f.suffix.lower() in ALLOWED_EXTENSIONS
        )
        if not photos:
            continue

        print(f"Uploading {len(photos)} photos for {slug} (court_id={court_id})")

        for photo in photos:
            success = upload_photo(args.base_url, args.token, court_id, photo)
            if success:
                total_uploaded += 1
                print(f"  OK {slug}/{photo.name}")
            else:
                total_failed += 1

    print(f"\nDone!")
    print(f"  Uploaded: {total_uploaded}")
    print(f"  Failed: {total_failed}")
    print(f"  Skipped (no matching court): {total_skipped}")


if __name__ == "__main__":
    main()
