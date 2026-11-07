"""Private, repeatable scoresheet comparisons. No application/database writes.

Run with PYTHONPATH=apps:. python scripts/eval_scoresheets.py --help in the
backend Python environment (httpx/Pillow required).

A manifest outside the public repo contains:
{"cases": [{"id": "sheet-date", "image": "/private/photo.jpg",
 "members": [{"player_id": 1, "player_name": "Name"}],
 "expected": [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]}]}

Review the private expected games before running; unreviewed cases are rejected.
Use the same production roster and images for all models. Results and summaries
include exact-game agreement, unresolved identities, latency and a spend ledger.
"""

import argparse
import json
import os
from pathlib import Path
import time
import tempfile
from dotenv import load_dotenv

import httpx


REPO = Path(__file__).resolve().parents[1]


def private_path(value):
    path = Path(value).expanduser().resolve()
    if path.is_relative_to(REPO):
        raise ValueError("Keep real photos, manifests, and results outside the public repository")
    return path


def save_private(path, data):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Atomic replacement preserves the last complete report if interrupted.
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as file:
        temporary = Path(file.name)
        os.chmod(temporary, 0o600)
        json.dump(data, file, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, path)


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


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--env-file",
        default=str(REPO / ".env"),
        help="Local server environment file; credentials never enter reports",
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
    compare.add_argument("--budget-usd", type=float, default=3.0)
    compare.add_argument("--prior-spend-usd", type=float, default=0.0)
    compare.add_argument("--ledger", help="Private cumulative budget ledger shared across runs")
    compare.add_argument(
        "--reuse-results", action="append", help="Reuse outputs only when request hashes match"
    )
    args = parser.parse_args()
    load_dotenv(args.env_file)
    if args.command == "snapshot":
        snapshot(args)
    else:
        from scripts.scoresheet_evals.runner import run_comparison

        run_comparison(args)


if __name__ == "__main__":
    main()
