#!/usr/bin/env python3
"""
Upload local court photos to S3 and insert court_photos rows.

Reads photos from apps/web/public/courts/{slug}/ and for each:
  1. Looks up the court_id by slug
  2. Uploads .jpg/.jpeg/.png/.webp files to S3 at court-photos/{court_id}/{filename}
  3. Inserts a court_photos row

Idempotent: skips files already uploaded (checks s3_key existence).

Usage:
    python scripts/upload_court_photos.py
"""

import asyncio
import os
import sys
from pathlib import Path

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database.db import AsyncSessionLocal
from backend.database.models import Court, CourtPhoto
from backend.services import s3_service

PHOTOS_DIR = Path(project_root) / "apps" / "web" / "public" / "courts"
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


async def upload_photos_for_court(session, slug: str, photo_dir: Path) -> int:
    """Upload all photos in a directory for a court slug. Returns count of new uploads."""
    # Look up court by slug
    result = await session.execute(select(Court.id).where(Court.slug == slug))
    row = result.first()
    if not row:
        print(f"  SKIP {slug}: no court found with this slug")
        return 0

    court_id = row[0]
    uploaded = 0

    # Get existing s3_keys for this court to avoid duplicates
    existing_result = await session.execute(
        select(CourtPhoto.s3_key).where(CourtPhoto.court_id == court_id)
    )
    existing_keys = {r[0] for r in existing_result.all()}

    # Get current max sort_order
    max_order_result = await session.execute(
        select(CourtPhoto.sort_order)
        .where(CourtPhoto.court_id == court_id)
        .order_by(CourtPhoto.sort_order.desc())
        .limit(1)
    )
    max_order_row = max_order_result.first()
    next_order = (max_order_row[0] + 1) if max_order_row else 0

    for photo_file in sorted(photo_dir.iterdir()):
        if photo_file.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue

        s3_key = f"court-photos/{court_id}/{photo_file.name}"
        if s3_key in existing_keys:
            print(f"  SKIP {slug}/{photo_file.name}: already uploaded")
            continue

        # Read and upload to S3
        file_bytes = photo_file.read_bytes()
        content_type = "image/jpeg" if photo_file.suffix.lower() in {".jpg", ".jpeg"} else f"image/{photo_file.suffix.lower().lstrip('.')}"

        try:
            url = s3_service.upload_file(file_bytes, s3_key, content_type)
        except Exception as e:
            print(f"  ERROR {slug}/{photo_file.name}: S3 upload failed — {e}")
            continue

        # Insert DB row
        photo = CourtPhoto(
            court_id=court_id,
            s3_key=s3_key,
            url=url,
            uploaded_by=None,  # System upload, no player
            sort_order=next_order,
        )
        session.add(photo)
        next_order += 1
        uploaded += 1
        print(f"  OK {slug}/{photo_file.name} -> {s3_key}")

    return uploaded


async def main():
    """Upload all local court photos to S3."""
    if not PHOTOS_DIR.exists():
        print(f"Photos directory not found: {PHOTOS_DIR}")
        sys.exit(1)

    court_dirs = sorted(d for d in PHOTOS_DIR.iterdir() if d.is_dir())
    print(f"Found {len(court_dirs)} court directories in {PHOTOS_DIR}\n")

    total_uploaded = 0
    async with AsyncSessionLocal() as session:
        for court_dir in court_dirs:
            slug = court_dir.name
            print(f"Processing: {slug}")
            count = await upload_photos_for_court(session, slug, court_dir)
            total_uploaded += count

        await session.commit()

    print(f"\nDone! Uploaded {total_uploaded} new photos.")


if __name__ == "__main__":
    asyncio.run(main())
