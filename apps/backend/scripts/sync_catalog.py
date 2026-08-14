"""Validate and explicitly synchronize the committed venue catalog.

The command is a database dry-run by default. Use ``--apply`` to execute the
reported changes in one transaction under a PostgreSQL advisory lock, or
``--validate-only`` for CI environments without a database.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import hashlib
import json
import re
from dataclasses import dataclass, field as dataclass_field
from pathlib import Path
from typing import Any, Iterable

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.db import AsyncSessionLocal, engine
from backend.database.models import Court, CourtTag, Location, Region

CATALOG_DIR = Path(__file__).resolve().parent.parent / "seed"
CATALOG_SOURCE = "backend/seed"
ADVISORY_LOCK_KEY = 0x424B434154  # stable application-local key: "BKCAT"

LOCATION_HEADERS = (
    "hub_id",
    "display_name",
    "region",
    "region_id",
    "tier",
    "center_city",
    "state",
    "lat",
    "lng",
    "seasonality",
    "radius_miles",
    "country",
    "slug",
)
COURT_HEADERS = (
    "name",
    "slug",
    "address",
    "location_id",
    "court_count",
    "surface_type",
    "is_free",
    "has_lights",
    "has_restrooms",
    "has_parking",
    "nets_provided",
    "latitude",
    "longitude",
    "description",
)
TAG_HEADERS = ("name", "slug", "category", "sort_order")


class CatalogValidationError(ValueError):
    """Raised before any database access when committed catalog data is invalid."""


@dataclass(frozen=True)
class Catalog:
    revision: str
    regions: tuple[dict[str, Any], ...]
    locations: tuple[dict[str, Any], ...]
    tags: tuple[dict[str, Any], ...]
    courts: tuple[dict[str, Any], ...]


@dataclass
class SyncSummary:
    added: int = 0
    adopted: int = 0
    updated: int = 0
    reactivated: int = 0
    retired: int = 0
    unchanged: int = 0
    changes: list[str] = dataclass_field(default_factory=list)

    @property
    def changed(self) -> int:
        return self.added + self.adopted + self.updated + self.reactivated + self.retired


def _read_csv(path: Path, expected_headers: tuple[str, ...]) -> list[dict[str, str]]:
    if not path.exists():
        raise CatalogValidationError(f"Missing catalog file: {path}")
    with path.open(encoding="utf-8", newline="") as handle:
        raw_rows = list(csv.reader(handle))
    if not raw_rows or tuple(raw_rows[0]) != expected_headers:
        raise CatalogValidationError(
            f"{path.name}: expected headers {expected_headers}, got {tuple(raw_rows[0]) if raw_rows else ()}"
        )
    width = len(expected_headers)
    malformed = [index for index, row in enumerate(raw_rows[1:], start=2) if len(row) != width]
    if malformed:
        raise CatalogValidationError(f"{path.name}: malformed row width at lines {malformed}")
    return [dict(zip(expected_headers, row, strict=True)) for row in raw_rows[1:]]


def _required(row: dict[str, str], fields: Iterable[str], source: str, line: int) -> None:
    missing = [field for field in fields if not row[field].strip()]
    if missing:
        raise CatalogValidationError(f"{source}:{line}: missing {', '.join(missing)}")


def _unique(rows: list[dict[str, str]], field: str, source: str) -> None:
    seen: dict[str, int] = {}
    for line, row in enumerate(rows, start=2):
        key = row[field].strip()
        if key in seen:
            raise CatalogValidationError(
                f"{source}:{line}: duplicate {field} {key!r} (first at line {seen[key]})"
            )
        seen[key] = line


def _number(value: str, field: str, source: str, line: int) -> float:
    try:
        return float(value)
    except ValueError as exc:
        raise CatalogValidationError(f"{source}:{line}: invalid {field} {value!r}") from exc


def _integer(value: str, field: str, source: str, line: int) -> int | None:
    if not value:
        return None
    try:
        parsed = int(value)
    except ValueError as exc:
        raise CatalogValidationError(f"{source}:{line}: invalid {field} {value!r}") from exc
    if parsed < 0:
        raise CatalogValidationError(f"{source}:{line}: {field} cannot be negative")
    return parsed


def _boolean(value: str, field: str, source: str, line: int) -> bool:
    if value.lower() not in {"true", "false"}:
        raise CatalogValidationError(f"{source}:{line}: invalid {field} {value!r}")
    return value.lower() == "true"


def _expected_slug(city: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", city.lower()))


def load_catalog(catalog_dir: Path = CATALOG_DIR) -> Catalog:
    """Load and fully validate all CSV files without touching the database."""
    location_rows = _read_csv(catalog_dir / "locations.csv", LOCATION_HEADERS)
    court_rows = _read_csv(catalog_dir / "courts.csv", COURT_HEADERS)
    tag_rows = _read_csv(catalog_dir / "court_tags.csv", TAG_HEADERS)
    for rows, field, source in (
        (location_rows, "hub_id", "locations.csv"),
        (location_rows, "slug", "locations.csv"),
        (court_rows, "slug", "courts.csv"),
        (tag_rows, "slug", "court_tags.csv"),
    ):
        _unique(rows, field, source)

    locations: list[dict[str, Any]] = []
    region_names: dict[str, str] = {}
    for line, row in enumerate(location_rows, start=2):
        _required(
            row,
            (
                "hub_id",
                "display_name",
                "region",
                "region_id",
                "center_city",
                "state",
                "country",
                "slug",
            ),
            "locations.csv",
            line,
        )
        expected_slug = _expected_slug(row["center_city"])
        if row["slug"] != expected_slug:
            raise CatalogValidationError(
                f"locations.csv:{line}: slug must be normalized center_city ({expected_slug!r})"
            )
        previous = region_names.setdefault(row["region_id"], row["region"])
        if previous != row["region"]:
            raise CatalogValidationError(
                f"locations.csv:{line}: region_id {row['region_id']!r} has conflicting names"
            )
        lat = _number(row["lat"], "lat", "locations.csv", line)
        lng = _number(row["lng"], "lng", "locations.csv", line)
        if not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise CatalogValidationError(f"locations.csv:{line}: coordinates are out of range")
        locations.append(
            {
                "id": row["hub_id"],
                "name": row["display_name"],
                "city": row["center_city"],
                "state": row["state"],
                "country": row["country"],
                "region_id": row["region_id"],
                "tier": _integer(row["tier"], "tier", "locations.csv", line),
                "latitude": lat,
                "longitude": lng,
                "seasonality": row["seasonality"],
                "radius_miles": _number(
                    row["radius_miles"], "radius_miles", "locations.csv", line
                ),
                "slug": row["slug"],
            }
        )

    location_ids = {row["id"] for row in locations}
    courts: list[dict[str, Any]] = []
    for line, row in enumerate(court_rows, start=2):
        _required(
            row,
            ("name", "slug", "address", "location_id", "surface_type", "latitude", "longitude"),
            "courts.csv",
            line,
        )
        if row["location_id"] not in location_ids:
            raise CatalogValidationError(
                f"courts.csv:{line}: unknown location_id {row['location_id']!r}"
            )
        lat = _number(row["latitude"], "latitude", "courts.csv", line)
        lng = _number(row["longitude"], "longitude", "courts.csv", line)
        if not -90 <= lat <= 90 or not -180 <= lng <= 180:
            raise CatalogValidationError(f"courts.csv:{line}: coordinates are out of range")
        courts.append(
            {
                "name": row["name"],
                "slug": row["slug"],
                "address": row["address"],
                "location_id": row["location_id"],
                "court_count": _integer(row["court_count"], "court_count", "courts.csv", line),
                "surface_type": row["surface_type"],
                "is_free": _boolean(row["is_free"], "is_free", "courts.csv", line),
                "has_lights": _boolean(row["has_lights"], "has_lights", "courts.csv", line),
                "has_restrooms": _boolean(
                    row["has_restrooms"], "has_restrooms", "courts.csv", line
                ),
                "has_parking": _boolean(row["has_parking"], "has_parking", "courts.csv", line),
                "nets_provided": _boolean(
                    row["nets_provided"], "nets_provided", "courts.csv", line
                ),
                "latitude": lat,
                "longitude": lng,
                "geoJson": json.dumps(
                    {"type": "Point", "coordinates": [lng, lat]}, separators=(",", ":")
                ),
                "description": row["description"] or None,
                "status": "approved",
            }
        )

    tags: list[dict[str, Any]] = []
    for line, row in enumerate(tag_rows, start=2):
        _required(row, TAG_HEADERS, "court_tags.csv", line)
        if row["category"] not in {"quality", "vibe", "facility"}:
            raise CatalogValidationError(f"court_tags.csv:{line}: invalid category")
        tags.append(
            {
                "name": row["name"],
                "slug": row["slug"],
                "category": row["category"],
                "sort_order": _integer(row["sort_order"], "sort_order", "court_tags.csv", line),
            }
        )

    digest = hashlib.sha256()
    for filename in ("locations.csv", "court_tags.csv", "courts.csv"):
        digest.update((catalog_dir / filename).read_bytes())
    regions = tuple({"id": key, "name": value} for key, value in sorted(region_names.items()))
    return Catalog(digest.hexdigest()[:16], regions, tuple(locations), tuple(tags), tuple(courts))


def _different(record: Any, values: dict[str, Any]) -> bool:
    return any(getattr(record, key) != value for key, value in values.items())


async def _sync_kind(
    session: AsyncSession,
    model: type,
    rows: tuple[dict[str, Any], ...],
    stable_field: str,
    revision: str,
    apply: bool,
    first_sync: bool,
    summary: SyncSummary,
) -> None:
    existing = (await session.execute(select(model))).scalars().all()
    by_key = {getattr(item, stable_field): item for item in existing}
    catalog_keys = {row[stable_field] for row in rows}
    for row in rows:
        key = row[stable_field]
        record = by_key.get(key)
        if record is None:
            summary.added += 1
            summary.changes.append(f"ADD {model.__tablename__} {key}")
            if apply:
                session.add(
                    model(
                        **row,
                        is_active=True,
                        catalog_managed=True,
                        catalog_source=CATALOG_SOURCE,
                        catalog_revision=revision,
                    )
                )
            continue
        if not record.catalog_managed:
            if not first_sync:
                raise RuntimeError(
                    f"Catalog {model.__tablename__}.{stable_field} {key!r} collides with a non-catalog row"
                )
            summary.adopted += 1
            summary.changes.append(f"ADOPT {model.__tablename__} {key}")
            changed = True
        else:
            changed = _different(record, row)
            if not record.is_active:
                summary.reactivated += 1
                summary.changes.append(f"REACTIVATE {model.__tablename__} {key}")
            elif (
                changed
                or record.catalog_source != CATALOG_SOURCE
                or record.catalog_revision != revision
            ):
                summary.updated += 1
                drift_fields = [
                    field_name
                    for field_name, value in row.items()
                    if getattr(record, field_name) != value
                ]
                detail = ", ".join(drift_fields) if drift_fields else "catalog revision"
                summary.changes.append(f"UPDATE {model.__tablename__} {key}: {detail}")
            else:
                summary.unchanged += 1
        if apply:
            for field, value in row.items():
                setattr(record, field, value)
            record.is_active = True
            record.catalog_managed = True
            record.catalog_source = CATALOG_SOURCE
            record.catalog_revision = revision

    for record in existing:
        if (
            record.catalog_managed
            and getattr(record, stable_field) not in catalog_keys
            and record.is_active
        ):
            summary.retired += 1
            summary.changes.append(f"RETIRE {model.__tablename__} {getattr(record, stable_field)}")
            if apply:
                record.is_active = False
                record.catalog_revision = revision


async def sync_catalog(session: AsyncSession, catalog: Catalog, *, apply: bool) -> SyncSummary:
    """Compare or apply a validated catalog using the supplied transaction."""
    if apply:
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": ADVISORY_LOCK_KEY}
        )
    managed_count = 0
    for model in (Region, Location, CourtTag, Court):
        managed_count += int(
            (
                await session.execute(
                    select(func.count()).select_from(model).where(model.catalog_managed)
                )
            ).scalar_one()
        )
    first_sync = managed_count == 0
    summary = SyncSummary()
    await _sync_kind(
        session, Region, catalog.regions, "id", catalog.revision, apply, first_sync, summary
    )
    await session.flush()
    await _sync_kind(
        session, Location, catalog.locations, "id", catalog.revision, apply, first_sync, summary
    )
    await session.flush()
    await _sync_kind(
        session, CourtTag, catalog.tags, "slug", catalog.revision, apply, first_sync, summary
    )
    await _sync_kind(
        session, Court, catalog.courts, "slug", catalog.revision, apply, first_sync, summary
    )
    return summary


async def _run(catalog: Catalog, apply: bool) -> SyncSummary:
    async with AsyncSessionLocal() as session:
        if apply:
            async with session.begin():
                return await sync_catalog(session, catalog, apply=True)
        summary = await sync_catalog(session, catalog, apply=False)
        await session.rollback()
        return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="apply changes atomically")
    parser.add_argument(
        "--validate-only", action="store_true", help="validate CSVs without database access"
    )
    args = parser.parse_args()
    if args.apply and args.validate_only:
        parser.error("--apply and --validate-only are mutually exclusive")
    catalog = load_catalog()
    print(
        f"Catalog {catalog.revision}: {len(catalog.locations)} locations, "
        f"{len(catalog.courts)} courts, {len(catalog.tags)} tags validated"
    )
    if args.validate_only:
        return
    try:
        summary = asyncio.run(_run(catalog, args.apply))
        mode = "applied" if args.apply else "dry-run"
        for change in summary.changes:
            print(change)
        print(
            f"Catalog {mode}: added={summary.added} adopted={summary.adopted} "
            f"updated={summary.updated} reactivated={summary.reactivated} "
            f"retired={summary.retired} unchanged={summary.unchanged}"
        )
    finally:
        asyncio.run(engine.dispose())


if __name__ == "__main__":
    main()
