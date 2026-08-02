import csv
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


def test_court_seed_catalog_is_consistent():
    courts = _rows("courts.csv")
    location_ids = {row["hub_id"] for row in _rows("locations.csv")}
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
        if row["latitude"]:
            assert -90 <= float(row["latitude"]) <= 90
        if row["longitude"]:
            assert -180 <= float(row["longitude"]) <= 180
