"""Private, repeatable scoresheet comparisons. No application/database writes.

Run with PYTHONPATH=apps:. python scripts/eval_scoresheets.py --help in the
backend Python environment (httpx/Pillow required).

A manifest outside the public repo contains:
{"cases": [{"id": "sheet-date", "image": "/private/photo.jpg",
 "members": [{"player_id": 1, "player_name": "Name"}],
 "expected": [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]}]}

Omit expected until ground truth has been reviewed; those runs report extraction
and latency only, never an accuracy score. Use the same roster for all models.
"""

import argparse
import json
import os
from pathlib import Path
import time

import httpx

from backend.services.games import photo_match_service, scoresheet_ai
from scripts.scoresheet_evals.metrics import evaluate

REPO = Path(__file__).resolve().parents[1]


def private_path(value):
    path = Path(value).expanduser().resolve()
    if path.is_relative_to(REPO):
        raise ValueError("Keep real photos, manifests, and results outside the public repository")
    return path


def save_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with path.open("w") as file:
        os.chmod(path, 0o600)
        json.dump(data, file, indent=2)
        file.write("\n")


def snapshot(args):
    """The production-facing operation issues GET requests only."""
    output = private_path(args.output)
    image = private_path(args.image)
    token = os.getenv("BEACH_LEAGUE_EVAL_TOKEN", "").strip()
    if not token:
        raise ValueError("Set BEACH_LEAGUE_EVAL_TOKEN to an authorized production access token")
    if args.api_base != "https://beachleaguevb.com":
        raise ValueError("Production snapshots require https://beachleaguevb.com")
    with httpx.Client(
        base_url=args.api_base, headers={"Authorization": f"Bearer {token}"}, timeout=30
    ) as client:
        response = client.get(f"/api/sessions/{args.session_id}")
        response.raise_for_status()
        session = response.json()
        league_id = session.get("league_id")
        if not league_id:
            raise ValueError("Only league sessions are supported")
        response = client.get(f"/api/leagues/{league_id}/members")
        response.raise_for_status()
        members = response.json()
    games = session["games"]
    if args.match_id:
        games = [game for game in games if game["id"] in args.match_id]
        if {game["id"] for game in games} != set(args.match_id):
            raise ValueError("Some requested games were not found in this session")
    expected = []
    for game in games:
        values = [
            game.get(f"team{team}_player{player}_id") for team in (1, 2) for player in (1, 2)
        ]
        if any(value is None for value in values):
            raise ValueError(
                "Ground truth contains missing/deleted player IDs; review labels manually"
            )
        expected.append(
            {
                "t1": values[:2],
                "t2": values[2:],
                "s": f"{game['team1_score']}-{game['team2_score']}",
            }
        )
    case = {
        "id": args.case_id,
        "image": str(image),
        "session_id": args.session_id,
        "match_ids": [game["id"] for game in games],
        "source": args.api_base,
        "snapshot_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "label_review_required": True,
        "members": [
            {key: member.get(key) for key in ("player_id", "player_name", "player_nickname")}
            for member in members
        ],
        "expected": expected,
    }
    manifest = json.loads(output.read_text()) if output.exists() else {"cases": []}
    if any(item["id"] == case["id"] for item in manifest["cases"]):
        raise ValueError(
            "Case already exists; review the private manifest rather than overwriting labels"
        )
    manifest["cases"].append(case)
    save_private(output, manifest)
    print(
        f"Saved one private case with {len(expected)} candidate game labels; review photo coverage before evaluation."
    )


def run(args):
    manifest_path = private_path(args.manifest)
    output = private_path(args.output)
    manifest = json.loads(manifest_path.read_text())
    results = []
    for case in manifest["cases"]:
        image = private_path(case["image"])
        image_bytes, _ = photo_match_service.preprocess_image(image.read_bytes())
        prompt = photo_match_service.build_scoreboard_prompt(case.get("members", []))
        for model in args.model:
            start = time.monotonic()
            row = {"case_id": case["id"], "model": model}
            try:
                raw = scoresheet_ai.generate(prompt, image_bytes, model=model)
                matches = photo_match_service._parse_extraction_array(raw)
                row.update({"matches": matches, "extracted_games": len(matches)})
                if "expected" in case and not case.get("label_review_required", False):
                    row["metrics"] = evaluate(matches, case["expected"])
                else:
                    row["accuracy"] = "unscored: ground truth absent or awaiting review"
            except Exception as error:
                row["error"] = type(error).__name__  # Do not print provider/input data.
                if isinstance(error, ValueError) and str(error).startswith("Scoresheet AI"):
                    row["error_detail"] = str(error)
            row["latency_seconds"] = round(time.monotonic() - start, 3)
            results.append(row)
            # Persist each result so interrupted comparisons can be inspected.
            save_private(output, {"manifest": str(manifest_path), "results": results})
            print(
                json.dumps(
                    {
                        key: row[key]
                        for key in (
                            "case_id",
                            "model",
                            "latency_seconds",
                            "metrics",
                            "extracted_games",
                            "accuracy",
                            "error",
                        )
                        if key in row
                    }
                )
            )


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    commands = parser.add_subparsers(dest="command", required=True)
    export = commands.add_parser(
        "snapshot", help="GET production session games and roster into a private manifest"
    )
    export.add_argument("--session-id", type=int, required=True)
    export.add_argument("--image", required=True)
    export.add_argument("--case-id", required=True)
    export.add_argument(
        "--match-id", action="append", type=int, help="Limit labels to games visible in this photo"
    )
    export.add_argument("--api-base", default="https://beachleaguevb.com")
    export.add_argument("--output", required=True)
    compare = commands.add_parser("run", help="Compare OpenAI models without creating games")
    compare.add_argument("--manifest", required=True)
    compare.add_argument("--model", action="append", required=True)
    compare.add_argument("--output", required=True)
    args = parser.parse_args()
    snapshot(args) if args.command == "snapshot" else run(args)


if __name__ == "__main__":
    main()
