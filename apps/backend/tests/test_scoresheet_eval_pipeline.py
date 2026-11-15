"""End-to-end evaluation orchestration with mocked paid calls and private fixtures."""

import argparse
import json
from pathlib import Path
from unittest.mock import Mock

from PIL import Image
import pytest

from scripts.scoresheet_evals import runner
from scripts.scoresheet_evals.budget import Budget


def arguments(tmp_path):
    image = tmp_path / "photo.jpg"
    Image.new("RGB", (80, 80), "white").save(image)
    manifest = tmp_path / "manifest.json"
    expected = [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]
    manifest.write_text(
        json.dumps(
            {
                "cases": [
                    {
                        "id": "test-sheet",
                        "image": str(image),
                        "members": [
                            {"player_id": n, "player_name": f"Test Player {n}"}
                            for n in (1, 2, 3, 4)
                        ],
                        "expected": expected,
                    }
                ]
            }
        )
    )
    return argparse.Namespace(
        manifest=str(manifest),
        output=str(tmp_path / "results.json"),
        model=["gpt-5.4-mini", "gpt-6.1-terra"],
        ledger=None,
        budget_usd=3,
        prior_spend_usd=0,
        reuse_results=None,
    )


def response():
    return {
        "text": '{"matches":[{"t1":[1,2],"t2":[3,4],"s":"21-19"}]}',
        "model": "test-snapshot",
        "usage": {"input_tokens": 100, "output_tokens": 10},
    }


def test_runs_model_set_outputs_metrics_and_reuses_matching_inputs(tmp_path, monkeypatch):
    args = arguments(tmp_path)
    provider = Mock(return_value=response())
    monkeypatch.setattr(runner.scoresheet_ai, "generate_with_usage", provider)
    runner.run_comparison(args)
    assert provider.call_count == 2
    report = json.loads(Path(args.output).read_text())
    assert all(model["game_accuracy"] == 1 for model in report["summary"]["models"].values())
    assert report["summary"]["budget"]["total_accounted_usd"] < 0.01
    args.reuse_results = [args.output]
    args.output = str(tmp_path / "rescore.json")
    runner.run_comparison(args)
    assert provider.call_count == 2
    assert all(row["reused"] for row in json.loads(Path(args.output).read_text())["results"])


def test_budget_blocks_calls_before_spending_and_counts_failures(tmp_path, monkeypatch):
    args = arguments(tmp_path)
    args.budget_usd = 0.000001
    provider = Mock()
    monkeypatch.setattr(runner.scoresheet_ai, "generate_with_usage", provider)
    with pytest.raises(SystemExit, match="Budget exhausted"):
        runner.run_comparison(args)
    provider.assert_not_called()
    summary = json.loads(Path(args.output).read_text())["summary"]
    assert summary["models"][args.model[0]]["game_accuracy"] == 0


def test_rejects_unreviewed_labels_and_unpriced_models_before_calls(tmp_path, monkeypatch):
    args = arguments(tmp_path)
    provider = Mock()
    monkeypatch.setattr(runner.scoresheet_ai, "generate_with_usage", provider)
    args.model = ["unpriced-model"]
    with pytest.raises(ValueError, match="pricing"):
        runner.run_comparison(args)
    provider.assert_not_called()


def test_reservations_survive_interrupted_runs_and_budget_restarts(tmp_path):
    path = tmp_path / "ledger.json"
    first = Budget(path, 1, 0.2)
    first.reserve(0.7)
    with pytest.raises(ValueError, match="budget"):
        Budget(path, 1).reserve(0.2)
    first.settle(0, 0.1)
    assert first.summary()["total_accounted_usd"] == 0.3


@pytest.mark.parametrize("limit", [float("nan"), float("inf"), -1, 0])
def test_rejects_invalid_budgets(tmp_path, limit):
    with pytest.raises(ValueError):
        Budget(tmp_path / "ledger.json", limit)


def test_unreviewed_reference_data_is_rejected_before_paid_calls(tmp_path, monkeypatch):
    args = arguments(tmp_path)
    path = Path(args.manifest)
    manifest = json.loads(path.read_text())
    manifest["cases"][0]["label_review_required"] = True
    path.write_text(json.dumps(manifest))
    provider = Mock()
    monkeypatch.setattr(runner.scoresheet_ai, "generate_with_usage", provider)
    with pytest.raises(ValueError, match="reviewed"):
        runner.run_comparison(args)
    provider.assert_not_called()
