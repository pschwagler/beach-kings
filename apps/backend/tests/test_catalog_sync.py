import csv
import shutil
from pathlib import Path

import pytest
from sqlalchemy import select

from backend.database.models import Court, Location
from backend.scripts.sync_catalog import (
    Catalog,
    CatalogValidationError,
    load_catalog,
    sync_catalog,
)


def _catalog_copy(tmp_path):
    source = Path(__file__).resolve().parent.parent / "seed"
    for filename in ("locations.csv", "courts.csv", "court_tags.csv"):
        shutil.copy(source / filename, tmp_path / filename)
    return tmp_path


def test_committed_catalog_acceptance_counts_and_explicit_location_fields():
    catalog = load_catalog()

    assert len(catalog.locations) == 79
    assert len(catalog.courts) == 428
    assert len(catalog.tags) == 15
    assert all(location["country"] for location in catalog.locations)
    assert len({location["slug"] for location in catalog.locations}) == 79
    assert all(-90 <= court["latitude"] <= 90 for court in catalog.courts)
    assert all(-180 <= court["longitude"] <= 180 for court in catalog.courts)


def test_validation_rejects_bad_row_width_before_database_access(tmp_path):
    catalog_dir = _catalog_copy(tmp_path)
    with (catalog_dir / "court_tags.csv").open("a", encoding="utf-8") as handle:
        handle.write("broken,row\n")

    with pytest.raises(CatalogValidationError, match="malformed row width"):
        load_catalog(catalog_dir)


def test_validation_rejects_duplicate_stable_keys(tmp_path):
    catalog_dir = _catalog_copy(tmp_path)
    path = catalog_dir / "court_tags.csv"
    rows = list(csv.reader(path.open(encoding="utf-8")))
    rows.append(rows[1])
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows(rows)

    with pytest.raises(CatalogValidationError, match="duplicate slug"):
        load_catalog(catalog_dir)


def test_validation_rejects_unknown_court_location(tmp_path):
    catalog_dir = _catalog_copy(tmp_path)
    path = catalog_dir / "courts.csv"
    rows = list(csv.reader(path.open(encoding="utf-8")))
    rows[1][3] = "missing_hub"
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows(rows)

    with pytest.raises(CatalogValidationError, match="unknown location_id"):
        load_catalog(catalog_dir)


def _small_catalog(*, courts=True, revision="revision-1"):
    return Catalog(
        revision=revision,
        regions=({"id": "test_region", "name": "Test Region"},),
        locations=(
            {
                "id": "test_location",
                "name": "Test Location",
                "city": "Testville",
                "state": "CA",
                "country": "USA",
                "region_id": "test_region",
                "tier": 1,
                "latitude": 32.7,
                "longitude": -117.2,
                "seasonality": "Year-Round",
                "radius_miles": 25.0,
                "slug": "testville",
            },
        ),
        tags=({"name": "Friendly", "slug": "friendly", "category": "vibe", "sort_order": 1},),
        courts=(
            {
                "name": "Catalog Court",
                "slug": "catalog-court",
                "address": "1 Beach Way",
                "location_id": "test_location",
                "court_count": 2,
                "surface_type": "sand",
                "is_free": True,
                "has_lights": False,
                "has_restrooms": True,
                "has_parking": True,
                "nets_provided": True,
                "latitude": 32.71,
                "longitude": -117.21,
                "geoJson": '{"type":"Point","coordinates":[-117.21,32.71]}',
                "description": "Committed description",
                "status": "approved",
            },
        )
        if courts
        else (),
    )


@pytest.mark.asyncio
async def test_sync_adopts_first_catalog_then_restores_drift_and_soft_retires(db_session):
    db_session.add(
        Location(
            id="test_location",
            name="Urgent edit",
            city="Testville",
            state="CA",
            country="USA",
            region_id=None,
            slug="testville",
            catalog_managed=False,
        )
    )
    await db_session.flush()

    first = await sync_catalog(db_session, _small_catalog(), apply=True)
    assert first.adopted == 1
    location = await db_session.get(Location, "test_location")
    assert location.catalog_managed is True
    assert location.name == "Test Location"

    court = (await db_session.execute(select(Court))).scalar_one()
    court.name = "Emergency admin correction"
    dry_run = await sync_catalog(db_session, _small_catalog(), apply=False)
    assert dry_run.updated >= 1
    assert court.name == "Emergency admin correction"

    await sync_catalog(db_session, _small_catalog(revision="revision-2"), apply=True)
    assert court.name == "Catalog Court"
    await sync_catalog(db_session, _small_catalog(courts=False, revision="revision-3"), apply=True)
    assert court.is_active is False
    reactivated = await sync_catalog(db_session, _small_catalog(revision="revision-4"), apply=True)
    assert reactivated.reactivated == 1
    assert court.is_active is True


@pytest.mark.asyncio
async def test_sync_refuses_to_adopt_later_non_catalog_collision(db_session):
    await sync_catalog(db_session, _small_catalog(), apply=True)
    location = await db_session.get(Location, "test_location")
    location.catalog_managed = False
    await db_session.flush()

    with pytest.raises(RuntimeError, match="collides with a non-catalog row"):
        await sync_catalog(db_session, _small_catalog(revision="revision-2"), apply=True)
