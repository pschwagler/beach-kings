"""Transport contract tests: no database or real provider calls."""

import json
from unittest.mock import patch

import httpx
import pytest

from backend.services.games import scoresheet_ai as ai


def client_for(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_missing_key_fails_without_request(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        ai._headers()


def test_strict_schema_image_detail_and_retention(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")

    def handler(request):
        data = json.loads(request.content)
        assert data["store"] is False
        assert data["input"][0]["content"][1]["detail"] == "high"
        assert data["text"]["format"]["schema"]["additionalProperties"] is False
        assert data["model"] == ai.DEFAULT_MODEL
        return httpx.Response(
            200,
            json={
                "status": "completed",
                "output": [{"content": [{"type": "output_text", "text": '{"matches":[]}'}]}],
            },
        )

    client = client_for(handler)
    with patch.object(ai.httpx, "Client", return_value=client):
        assert ai.generate("Read scores", b"photo") == '{"matches":[]}'


@pytest.mark.parametrize("status", [401, 429, 500])
def test_provider_errors_do_not_expose_response_bodies(monkeypatch, status):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    client = client_for(lambda _: httpx.Response(status, text="private provider details"))
    with patch.object(ai.httpx, "Client", return_value=client), pytest.raises(ValueError) as exc:
        ai.generate("Read scores")
    assert "private provider details" not in str(exc.value)


def test_incomplete_responses_are_not_accepted(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    client = client_for(lambda _: httpx.Response(200, json={"status": "incomplete", "output": []}))
    with (
        patch.object(ai.httpx, "Client", return_value=client),
        pytest.raises(ValueError, match="did not finish"),
    ):
        ai.generate("Read scores")


@pytest.mark.parametrize("terminal", ["response.completed", "response.incomplete", None])
def test_stream_requires_successful_terminal_event(monkeypatch, terminal):
    monkeypatch.setenv("OPENAI_API_KEY", "test-only")
    events = [{"type": "response.output_text.delta", "delta": '{"matches":[]}'}]
    if terminal:
        events.append({"type": terminal})
    body = "".join("data: " + json.dumps(event) + "\n\n" for event in events)
    client = client_for(lambda _: httpx.Response(200, text=body))
    with patch.object(ai.httpx, "Client", return_value=client):
        if terminal == "response.completed":
            assert list(ai.stream_text("Read", b"photo")) == ['{"matches":[]}']
        else:
            with pytest.raises(ValueError):
                list(ai.stream_text("Read", b"photo"))


def test_ambiguous_roster_name_remains_unresolved():
    from backend.services.games.photo_match_service import match_player_name

    members = [
        {"player_id": 1, "player_name": "Alex Example"},
        {"player_id": 2, "player_name": "Alex Sample"},
    ]
    assert match_player_name("Alex", members) is None
    assert match_player_name("Alex Example", members)["player_id"] == 1
