"""OpenAI transport for scoresheet extraction; no application/database writes."""

import base64
import json
import os
from typing import Iterator

import httpx

DEFAULT_MODEL = "gpt-5.4-mini"
RESPONSES_URL = "https://api.openai.com/v1/responses"

# Keep player IDs or literal names so uncertain handwriting remains reviewable.
_PLAYER = {"anyOf": [{"type": "integer"}, {"type": "string"}]}
_TEAM = {"type": "array", "items": _PLAYER, "minItems": 2, "maxItems": 2}
EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["matches"],
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["t1", "t2", "s"],
                "properties": {
                    "t1": _TEAM,
                    "t2": _TEAM,
                    "s": {
                        "type": "string",
                        "description": "Team 1-Team 2 final score; empty if unreadable",
                    },
                },
            },
        },
    },
}


def _headers() -> dict:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise ValueError("OPENAI_API_KEY is not configured for scoresheet parsing")
    return {"Authorization": f"Bearer {key}"}


def request_payload(
    prompt: str,
    image_bytes: bytes | None = None,
    *,
    model: str | None = None,
    structured: bool = True,
) -> dict:
    content = [{"type": "input_text", "text": prompt}]
    if image_bytes is not None:
        content.append(
            {
                "type": "input_image",
                "image_url": "data:image/jpeg;base64,"
                + base64.b64encode(image_bytes).decode("ascii"),
                "detail": "high",
            }
        )
    payload = {
        "model": model or os.getenv("SCORESHEET_MODEL", DEFAULT_MODEL),
        "store": False,
        "reasoning": {"effort": "low"},
        "max_output_tokens": 8192,
        "input": [{"role": "user", "content": content}],
    }
    if structured:
        payload["text"] = {
            "format": {
                "type": "json_schema",
                "name": "scoresheet",
                "strict": True,
                "schema": EXTRACTION_SCHEMA,
            }
        }
    return payload


def _check_status(response: httpx.Response) -> None:
    if response.is_error:
        # Never pass provider response bodies, credentials, or input back to users.
        raise ValueError(
            f"Scoresheet AI request failed (HTTP {response.status_code}). Please try again."
        )


def generate_with_usage(
    prompt: str,
    image_bytes: bytes | None = None,
    *,
    model: str | None = None,
    structured: bool = True,
    max_output_tokens: int = 8192,
) -> dict:
    with httpx.Client(timeout=httpx.Timeout(120, connect=10)) as client:
        payload = request_payload(prompt, image_bytes, model=model, structured=structured)
        payload["max_output_tokens"] = max_output_tokens
        response = client.post(RESPONSES_URL, headers=_headers(), json=payload)
        _check_status(response)
        data = response.json()
    if data.get("status") != "completed":
        raise ValueError("Scoresheet AI did not finish. Please try again.")
    texts = []
    for item in data.get("output", []):
        for part in item.get("content", []):
            if part.get("type") == "refusal":
                raise ValueError("This image could not be read. Try another scoresheet photo.")
            if part.get("type") == "output_text":
                texts.append(part["text"])
    text = "".join(texts)
    if not text:
        raise ValueError("Scoresheet AI returned no results. Please try another photo.")
    return {
        "text": text,
        "usage": data.get("usage", {}),
        "model": data.get("model", model or DEFAULT_MODEL),
    }


def generate(
    prompt: str,
    image_bytes: bytes | None = None,
    *,
    model: str | None = None,
    structured: bool = True,
) -> str:
    return generate_with_usage(prompt, image_bytes, model=model, structured=structured)["text"]


def stream_text(prompt: str, image_bytes: bytes) -> Iterator[str]:
    payload = request_payload(prompt, image_bytes)
    payload["stream"] = True
    with httpx.Client(timeout=httpx.Timeout(120, connect=10)) as client:
        with client.stream("POST", RESPONSES_URL, headers=_headers(), json=payload) as response:
            _check_status(response)
            for line in response.iter_lines():
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                event = json.loads(line[6:])
                kind = event.get("type")
                if kind == "response.output_text.delta":
                    yield event["delta"]
                elif kind == "response.completed":
                    return
                elif kind in {
                    "response.failed",
                    "response.incomplete",
                    "error",
                    "response.refusal.delta",
                }:
                    raise ValueError(
                        "Scoresheet AI could not finish reading this photo. Please try again."
                    )
    raise ValueError("Scoresheet AI connection ended before completion. Please try again.")
