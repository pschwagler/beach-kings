"""Reproducible model runs, offline rescoring, and privacy-safe aggregate reports."""

import hashlib
import json
from pathlib import Path
import statistics
import time

from backend.services.games import photo_match_service as service, scoresheet_ai
from scripts.scoresheet_evals.budget import Budget, PRICES, reserve_cost, usage_cost
from scripts.scoresheet_evals.metrics import evaluate
from scripts.scoresheet_evals.photo_metrics import evaluate_photo


def fingerprint(case, model, image_bytes, prompt):
    return hashlib.sha256(
        json.dumps(
            {
                "model": model,
                "image_sha256": hashlib.sha256(image_bytes).hexdigest(),
                "prompt": prompt,
                "schema": scoresheet_ai.EXTRACTION_SCHEMA,
                "reasoning": "low",
                "detail": "high",
                "max_output_tokens": 8192,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()


def resolve(matches, members):
    normalized, _ = service.match_all_players_in_matches(
        service.normalize_extraction_response(matches)["matches"], members
    )
    result = []
    for match in normalized:
        players = []
        for field in ("team1_player1", "team1_player2", "team2_player1", "team2_player2"):
            players.append(match.get(field + "_id") or match[field].get("name") or "unresolved")
        result.append(
            {
                "t1": players[:2],
                "t2": players[2:],
                "s": f"{match['team1_score']}-{match['team2_score']}",
            }
        )
    return result


def summarize(rows, budget):
    models = {}
    for model in sorted({row["model"] for row in rows}):
        group = [row for row in rows if row["model"] == model]
        scored = [row for row in group if "metrics" in row]
        expected = sum(row["metrics"]["expected_games"] for row in scored)
        actual = sum(row["metrics"]["extracted_games"] for row in scored)
        exact = sum(row["metrics"]["exact_games"] for row in scored)
        models[model] = {
            "photos": len(group),
            "scored_photos": len(scored),
            "failures": sum("error" in row for row in group),
            "expected_games": expected,
            "exact_games": exact,
            "game_accuracy": exact / expected if expected else None,
            "precision": exact / actual if actual else 0,
            "complete_sheets": sum(row["metrics"]["all_games_correct"] for row in scored),
            "unresolved_player_slots": sum(
                row["metrics"]["unresolved_player_slots"] for row in scored
            ),
            "score_pairs_recovered": sum(
                row["metrics"]["score_pairs_recovered"] for row in scored
            ),
            "average_latency_seconds": round(
                statistics.mean(row["latency_seconds"] for row in group), 3
            ),
            "new_requests": sum(not row.get("reused", False) for row in group),
            "measured_cost_estimate_usd": round(
                sum(row.get("cost_estimate_usd", 0) or 0 for row in group), 6
            ),
        }
        photo_rows = [row["photo_metrics"] for row in group if "photo_metrics" in row]
        if photo_rows:
            reviewed = sum(row["reviewed_reference_games"] for row in photo_rows)
            consistent = sum(row["photo_consistent_games"] for row in photo_rows)
            models[model].update(
                {
                    "photo_reviewed_games": reviewed,
                    "photo_consistent_games": consistent,
                    "photo_accuracy": consistent / reviewed if reviewed else None,
                    "pending_photo_labels": sum(
                        row["pending_label_review_games"] for row in photo_rows
                    ),
                    "appropriate_ambiguous_abstentions": sum(
                        row["appropriate_ambiguous_abstentions"] for row in photo_rows
                    ),
                    "ambiguous_identity_selections": sum(
                        row["ambiguous_identity_selections"] for row in photo_rows
                    ),
                }
            )
    return {
        "models": models,
        "budget": budget.summary(),
        "metric_definition": "Exact games require both teams' player IDs and final scores to match production; teammate, team and row order are ignored. Score pairs alone do not verify player identity or winner. Unresolved names never count as correct IDs. Photo-grounded metrics separately accept annotated names/identity sets, credit appropriate abstention, and exclude pending transcription labels. An ambiguous identity selection is photo-compatible, not evidence that the identity was determined.",
    }


def run_comparison(args):
    # Import here to keep the CLI's read-only exporter separate from running AI.
    from scripts.eval_scoresheets import private_path, save_private

    manifest_path = private_path(args.manifest)
    output = private_path(args.output)
    manifest = json.loads(manifest_path.read_text())
    models = list(dict.fromkeys(args.model))
    if any(model not in PRICES for model in models):
        raise ValueError("A requested model has no verified pricing; no paid calls were made")
    budget = Budget(
        private_path(args.ledger or str(output.parent / "budget-ledger.json")),
        args.budget_usd,
        args.prior_spend_usd,
    )
    cache = {}
    for filename in args.reuse_results or []:
        for row in json.loads(private_path(filename).read_text())["results"]:
            if row.get("request_fingerprint") and "matches" in row:
                cache[row["request_fingerprint"]] = row
    results = []
    source_paths = [
        Path(__file__),
        Path(service.__file__),
        Path(scoresheet_ai.__file__),
        Path(__file__).with_name("metrics.py"),
        Path(__file__).with_name("photo_metrics.py"),
    ]
    evaluator_hash = hashlib.sha256(
        b"".join(path.read_bytes() for path in source_paths)
    ).hexdigest()
    dataset_hash = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    for case in manifest["cases"]:
        if case.get("label_review_required", False) or "expected" not in case:
            raise ValueError(
                f"Case {case['id']} needs reviewed production labels before accuracy evaluation"
            )
        if not case["expected"]:
            raise ValueError("Reference games cannot be empty for a scoresheet benchmark")
    for case in manifest["cases"]:
        image_bytes, _ = service.preprocess_image(private_path(case["image"]).read_bytes())
        prompt = service.build_scoreboard_prompt(case.get("members", []))
        if len(prompt.encode()) + 30_000 >= 272_000:
            raise ValueError("Prompt exceeds this evaluator's verified short-context pricing")
        for model in models:
            signature = fingerprint(case, model, image_bytes, prompt)
            row = {"case_id": case["id"], "model": model, "request_fingerprint": signature}
            started = time.monotonic()
            try:
                if signature in cache:
                    previous = cache[signature]
                    row.update(
                        {
                            "matches": previous["matches"],
                            "reused": True,
                            "latency_seconds": previous["latency_seconds"],
                            "usage": previous.get("usage"),
                            "cost_estimate_usd": previous.get("cost_estimate_usd"),
                        }
                    )
                else:
                    amount = reserve_cost(model, prompt, 8192)
                    ticket = budget.reserve(amount)  # Persist the reservation BEFORE the request.
                    response = scoresheet_ai.generate_with_usage(prompt, image_bytes, model=model)
                    row["latency_seconds"] = round(time.monotonic() - started, 3)
                    usage = response["usage"]
                    if "input_tokens" in usage and "output_tokens" in usage:
                        cost = usage_cost(model, usage)
                        budget.settle(ticket, cost)
                    else:
                        cost = amount  # Missing usage keeps the full reservation.
                    row.update(
                        {
                            "matches": service._parse_extraction_array(response["text"]),
                            "usage": usage,
                            "response_model": response["model"],
                            "cost_estimate_usd": cost,
                            "reused": False,
                        }
                    )
                row["resolved_matches"] = resolve(row["matches"], case.get("members", []))
                row["raw_metrics"] = evaluate(row["matches"], case["expected"])
                row["metrics"] = evaluate(row["resolved_matches"], case["expected"])
                if "photo_reference" in case:
                    row["photo_metrics"] = evaluate_photo(row["matches"], case["photo_reference"])
                    row["resolved_photo_metrics"] = evaluate_photo(
                        row["resolved_matches"], case["photo_reference"]
                    )
            except Exception as error:
                row["error"] = type(error).__name__
                row["latency_seconds"] = round(time.monotonic() - started, 3)
                # Failed calls count as zero correct games; excluding them inflates accuracy.
                row["metrics"] = evaluate([], case["expected"])
                if "photo_reference" in case:
                    row["photo_metrics"] = evaluate_photo([], case["photo_reference"])
                if isinstance(error, ValueError) and "budget" in str(error).lower():
                    row["error"] = "budget_exhausted"
            results.append(row)
            report = {
                "manifest": str(manifest_path),
                "dataset_sha256": dataset_hash,
                "evaluator_sha256": evaluator_hash,
                "configuration": {
                    "reasoning_effort": "low",
                    "image_detail": "high",
                    "max_output_tokens": 8192,
                    "max_image_edge": 2048,
                },
                "pricing_source": "https://developers.openai.com/api/docs/pricing",
                "results": results,
                "summary": summarize(results, budget),
            }
            save_private(output, report)
            save_private(output.with_name(output.stem + "-summary.json"), report["summary"])
            print(
                json.dumps(
                    {
                        key: row[key]
                        for key in ("case_id", "model", "latency_seconds", "metrics", "error")
                        if key in row
                    }
                ),
                flush=True,
            )
            if row.get("error") == "budget_exhausted":
                raise SystemExit("Budget exhausted; partial metrics saved. No further calls made.")
    print(json.dumps({"summary": summarize(results, budget)}, indent=2), flush=True)
