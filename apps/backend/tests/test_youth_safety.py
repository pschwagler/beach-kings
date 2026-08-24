"""Youth eligibility, minimized data, privacy defaults, and contact rules."""

import pytest
from pydantic import ValidationError

from backend.models.schemas import PlayerUpdate, YouthEligibilityRequest
from backend.services import youth_interaction_policy, youth_safety_service


def _facts(**overrides):
    values = {
        "declared_band": "adult",
        "assurance_source": "self_declared",
        "declaration_source": "self_declared",
        "guardian_consent": False,
    }
    values.update(overrides)
    return youth_safety_service.evaluate_gate(**values)


def test_global_minimum_rejects_under_fourteen_without_jurisdiction():
    with pytest.raises(
        youth_safety_service.YouthEligibilityError,
        match="at least 14",
    ):
        _facts(declared_band="under_minimum")


def test_junior_boundary_requires_guardian_consent():
    with pytest.raises(youth_safety_service.YouthEligibilityError, match="guardian"):
        _facts(
            declared_band="junior",
            guardian_consent=False,
        )
    facts = _facts(
        declared_band="junior",
        declaration_source="guardian_declared",
        guardian_consent=True,
    )
    assert facts.age_group == "junior"
    assert facts.country_code is None
    assert facts.region_code is None


def test_signed_token_round_trip_and_privacy_defaults():
    facts = _facts(declared_band="junior", guardian_consent=True)
    decoded = youth_safety_service.decode_eligibility_token(
        youth_safety_service.create_eligibility_token(facts)
    )
    assert decoded == facts
    values = youth_safety_service.account_values(decoded)
    assert values["profile_is_private"] is True
    assert values["show_game_history"] is False
    assert values["eligibility_country"] is None
    assert values["eligibility_region"] is None
    assert "birthdate" not in values


def test_adult_defaults_do_not_inherit_junior_privacy_settings():
    values = youth_safety_service.account_values(_facts())
    assert values["profile_is_private"] is False
    assert values["show_game_history"] is True


def test_tampered_or_missing_token_fails_closed():
    token = youth_safety_service.create_eligibility_token(_facts())
    with pytest.raises(youth_safety_service.YouthEligibilityError):
        youth_safety_service.decode_eligibility_token(token + "tampered")
    with pytest.raises(youth_safety_service.YouthEligibilityError):
        youth_safety_service.decode_eligibility_token(None)


def test_gate_schema_rejects_registration_pii():
    with pytest.raises(ValidationError):
        YouthEligibilityRequest.model_validate(
            {
                "declared_band": "adult",
                "assurance_source": "self_declared",
                "declaration_source": "self_declared",
                "guardian_consent": False,
                "email": "not-collected-here@example.com",
            }
        )


def test_legacy_jurisdiction_fields_are_accepted_but_discarded():
    request = YouthEligibilityRequest.model_validate(
        {
            "country_code": "US",
            "region_code": "NY",
            "declared_band": "adult",
            "assurance_source": "self_declared",
            "declaration_source": "self_declared",
        }
    )
    facts = youth_safety_service.evaluate_gate(**request.model_dump())
    assert facts.country_code is None
    assert facts.region_code is None


def test_exact_birthdate_update_is_rejected():
    with pytest.raises(ValidationError, match="Date of birth is not collected"):
        PlayerUpdate(date_of_birth="2010-01-01")


@pytest.mark.asyncio
async def test_junior_dm_requires_active_shared_league(monkeypatch):
    async def junior(_session, player_id):
        return player_id == 2

    async def no_shared_league(_session, _first, _second):
        return False

    monkeypatch.setattr(youth_interaction_policy, "player_is_junior", junior)
    monkeypatch.setattr(youth_interaction_policy, "share_active_league", no_shared_league)
    with pytest.raises(ValueError, match="active shared league"):
        await youth_interaction_policy.enforce_direct_message_pair(object(), 1, 2)


@pytest.mark.asyncio
async def test_adult_dm_does_not_require_shared_league(monkeypatch):
    async def adult(_session, _player_id):
        return False

    monkeypatch.setattr(youth_interaction_policy, "player_is_junior", adult)
    await youth_interaction_policy.enforce_direct_message_pair(object(), 1, 2)
