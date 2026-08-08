import csv
import math
from pathlib import Path


SEED_DIR = Path(__file__).resolve().parents[1] / "seed"
RETIRED_SLUGS = {
    "baker-beach-volleyball-court-san-francisco",
    "desert-breeze-park-las-vegas",
    "dig-and-dive-wilmington",
    "emmitt-park-san-antonio",
    "folly-beach-county-park-folly-beach",
    "garland-park-denver",
    "lv-beach-volleyball-las-vegas",
    "mike-chappell-park-carolina-beach",
    "sand-key-park-clearwater",
    "sand-santa-cruz-indoor-santa-cruz",
    "vollis-beach-nashville",
    "woodlawn-lake-park-san-antonio",
}


def _rows(filename: str) -> list[dict[str, str]]:
    with (SEED_DIR / filename).open(encoding="utf-8", newline="") as file:
        return list(csv.DictReader(file))


def _distance_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    value = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * 3958.8 * math.asin(math.sqrt(value))


def test_court_seed_catalog_is_consistent():
    courts = _rows("courts.csv")
    locations = _rows("locations.csv")
    locations_by_id = {row["hub_id"]: row for row in locations}
    location_ids = set(locations_by_id)
    slugs = [row["slug"] for row in courts]

    assert len(slugs) == len(set(slugs))
    assert RETIRED_SLUGS.isdisjoint(slugs)
    assert all(row["surface_type"] in {"sand", "indoor_sand"} for row in courts)
    assert all(row["location_id"] in location_ids for row in courts)

    for row in courts:
        assert row["name"] and row["slug"] and row["address"]
        assert row["is_free"] in {"true", "false"}
        assert row["has_lights"] in {"true", "false"}
        assert row["has_restrooms"] in {"true", "false"}
        assert row["has_parking"] in {"true", "false"}
        assert row["nets_provided"] in {"true", "false"}
        assert row["latitude"] and row["longitude"]
        latitude = float(row["latitude"])
        longitude = float(row["longitude"])
        assert -90 <= latitude <= 90
        assert -180 <= longitude <= 180

        location = locations_by_id[row["location_id"]]
        distance = _distance_miles(
            float(location["lat"]),
            float(location["lng"]),
            latitude,
            longitude,
        )
        allowed_distance = max(30, float(location["radius_miles"]) * 1.35)
        assert distance <= allowed_distance, row["slug"]


def test_canadian_courts_use_country_aware_hubs():
    locations = _rows("locations.csv")
    courts = _rows("courts.csv")
    canada_hubs = {row["hub_id"] for row in locations if row["country"] == "Canada"}

    assert canada_hubs
    assert all(row["hub_id"].startswith("ca_") for row in locations if row["country"] == "Canada")
    assert all(
        row["location_id"] in canada_hubs for row in courts if row["location_id"].startswith("ca_")
    )
