#!/usr/bin/env python3
"""Geocode missing court seed coordinates with validation.

Uses OpenStreetMap Nominatim at its public one-request-per-second limit, caches
responses locally, and rejects broad place/region centroids. The default mode is
read-only. Pass ``--apply`` to write accepted coordinates to courts.csv.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "apps" / "backend" / "seed"
COURTS_PATH = SEED_DIR / "courts.csv"
LOCATIONS_PATH = SEED_DIR / "locations.csv"
DEFAULT_CACHE = Path("/tmp/beach-kings-court-geocodes.json")
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "BeachKingsCourtSeedAudit/1.0 (https://beachleaguevb.com)"
REJECTED_ADDRESSTYPES = {
    "city",
    "county",
    "country",
    "municipality",
    "postcode",
    "province",
    "region",
    "state",
    "state_district",
    "town",
    "village",
}


def _distance_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_miles = 3958.8
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    value = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * radius_miles * math.asin(math.sqrt(value))


def _load_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        return list(reader.fieldnames or []), list(reader)


def _load_cache(path: Path) -> dict[str, list[dict[str, Any]]]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as file:
        return json.load(file)


def _save_cache(path: Path, cache: dict[str, list[dict[str, Any]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(cache, file, ensure_ascii=False, indent=2, sort_keys=True)


def _search(
    query: str,
    country_code: str,
    cache: dict[str, list[dict[str, Any]]],
    cache_path: Path,
) -> list[dict[str, Any]]:
    cache_key = f"{country_code}|{query}"
    if cache_key in cache:
        return cache[cache_key]

    params = urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "countrycodes": country_code,
            "limit": 5,
        }
    )
    request = Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en"},
    )
    with urlopen(request, timeout=20) as response:  # noqa: S310 - fixed HTTPS host
        results = json.load(response)

    cache[cache_key] = results
    _save_cache(cache_path, cache)
    time.sleep(1.05)
    return results


def _select_result(
    results: list[dict[str, Any]], location: dict[str, str]
) -> tuple[dict[str, Any] | None, str]:
    hub_lat = float(location["lat"])
    hub_lng = float(location["lng"])
    radius = float(location["radius_miles"])
    maximum_distance = max(30.0, radius * 1.35)
    candidates: list[tuple[int, float, dict[str, Any]]] = []

    for rank, result in enumerate(results):
        address_type = str(result.get("addresstype") or result.get("type") or "")
        if address_type in REJECTED_ADDRESSTYPES:
            continue
        lat = float(result["lat"])
        lng = float(result["lon"])
        distance = _distance_miles(hub_lat, hub_lng, lat, lng)
        if distance > maximum_distance:
            continue
        candidates.append((rank, distance, result))

    if not candidates:
        return None, f"no specific result within {maximum_distance:.0f} mi of hub"

    candidates.sort(key=lambda item: (item[0], item[1]))
    selected = candidates[0][2]
    return selected, "accepted"


def _write_rows(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        all_rows = [dict(zip(fieldnames, fieldnames, strict=True)), *rows]
        for row_index, row in enumerate(all_rows):
            cells = []
            for fieldname in fieldnames:
                value = row.get(fieldname, "")
                force_quotes = fieldname == "description" and row_index > 0
                if force_quotes or any(character in value for character in ',"\r\n'):
                    value = f'"{value.replace(chr(34), chr(34) * 2)}"'
                cells.append(value)
            file.write(",".join(cells) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()

    court_fields, courts = _load_rows(COURTS_PATH)
    _, locations = _load_rows(LOCATIONS_PATH)
    locations_by_id = {row["hub_id"]: row for row in locations}
    cache = _load_cache(args.cache)
    missing = [
        row for row in courts if not row["latitude"] or not row["longitude"]
    ]
    if args.limit is not None:
        missing = missing[: args.limit]

    accepted = 0
    unresolved = 0
    for index, court in enumerate(missing, start=1):
        location = locations_by_id[court["location_id"]]
        country = location.get("country") or "USA"
        country_code = "ca" if country == "Canada" else "us"
        query = f'{court["name"]}, {court["address"]}'
        try:
            results = _search(query, country_code, cache, args.cache)
            selected, reason = _select_result(results, location)
            if selected is None:
                results = _search(court["address"], country_code, cache, args.cache)
                selected, reason = _select_result(results, location)
        except Exception as exc:
            selected, reason = None, f"request failed: {exc}"

        if selected is None:
            unresolved += 1
            print(f'[{index}/{len(missing)}] REVIEW {court["slug"]}: {reason}')
            continue

        latitude = f'{float(selected["lat"]):.7f}'
        longitude = f'{float(selected["lon"]):.7f}'
        accepted += 1
        print(
            f'[{index}/{len(missing)}] OK {court["slug"]}: '
            f'{latitude},{longitude} — {selected.get("display_name", "")}'
        )
        if args.apply:
            court["latitude"] = latitude
            court["longitude"] = longitude

    if args.apply:
        _write_rows(COURTS_PATH, court_fields, courts)

    mode = "applied" if args.apply else "dry-run"
    print(f"{mode}: {accepted} accepted, {unresolved} review")
    return 0 if unresolved == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
