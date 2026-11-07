"""Conservative request reservations plus a durable ledger shared across runs."""

import fcntl
import json
import os
import math
from pathlib import Path

# Standard USD / 1M tokens, checked 2026-11-07:
# https://developers.openai.com/api/docs/pricing
PRICES = {"gpt-6.1-terra": (1.0, 5.0), "gpt-5.4-mini": (0.75, 4.5), "gpt-6.1-sol": (2.0, 10.0)}


def usage_cost(model, usage):
    input_rate, output_rate = PRICES[model]
    # Charge all input at uncached rates, including cache writes, conservatively
    # using 2x input pricing. No cache discount is assumed.
    return (
        int(usage["input_tokens"]) * input_rate * 2 + int(usage["output_tokens"]) * output_rate
    ) / 1_000_000


def reserve_cost(model, prompt, max_output_tokens):
    if model not in PRICES:
        raise ValueError(f"No verified pricing for {model}; add pricing before running paid evals")
    # Our processed images are <=2048px/side. Reserve far above their normal
    # high-detail image-token use, plus one token per UTF-8 byte of prompt.
    return usage_cost(
        model, {"input_tokens": len(prompt.encode()) + 30_000, "output_tokens": max_output_tokens}
    )


class Budget:
    def __init__(self, path: Path, limit: float, prior_spend: float = 0):
        self.path = path
        self.limit = limit
        self.prior_spend = prior_spend
        if (
            not math.isfinite(limit)
            or not math.isfinite(prior_spend)
            or limit <= 0
            or prior_spend < 0
            or prior_spend > limit
        ):
            raise ValueError("Invalid budget or prior spend")
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

    def _update(self, change):
        with self.path.open("a+") as file:
            os.chmod(self.path, 0o600)
            fcntl.flock(file, fcntl.LOCK_EX)
            file.seek(0)
            state = json.loads(file.read() or "null") or {
                "charged_usd": 0,
                "prior_spend_usd": self.prior_spend,
                "requests": [],
            }
            state["prior_spend_usd"] = max(state["prior_spend_usd"], self.prior_spend)
            result = change(state)
            file.seek(0)
            file.truncate()
            json.dump(state, file, indent=2)
            file.flush()
            os.fsync(file.fileno())
            return result

    def reserve(self, amount):
        def change(state):
            if state["charged_usd"] + state["prior_spend_usd"] + amount > self.limit:
                raise ValueError("Evaluation budget would be exceeded; no request was sent")
            state["charged_usd"] += amount
            state["requests"].append({"reserved_usd": amount, "charged_usd": amount})
            return len(state["requests"]) - 1

        return self._update(change)

    def settle(self, ticket, actual):
        def change(state):
            row = state["requests"][ticket]
            state["charged_usd"] += actual - row["charged_usd"]
            row["charged_usd"] = actual

        self._update(change)

    def summary(self):
        return self._update(
            lambda state: {
                "limit_usd": self.limit,
                "run_charged_usd": round(state["charged_usd"], 6),
                "prior_spend_reserve_usd": state["prior_spend_usd"],
                "total_accounted_usd": round(state["charged_usd"] + state["prior_spend_usd"], 6),
            }
        )
