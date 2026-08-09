from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.services.social.interaction_policy import (
    ACTION_POLICY,
    DenialReason,
    InteractionAction,
    InteractionUnavailable,
    PolicyRule,
    _PairState,
    _public_capability,
    decide_interaction,
    interaction_decision,
)


def test_every_declared_action_has_an_explicit_rule():
    assert set(ACTION_POLICY) == set(InteractionAction)


@pytest.mark.parametrize(
    ("state", "reason"),
    [
        (_PairState(viewer_blocks_other=True), DenialReason.BLOCKED_BY_VIEWER),
        (_PairState(other_blocks_viewer=True), DenialReason.BLOCKED_BY_OTHER),
        (_PairState(viewer_restricted=True), DenialReason.VIEWER_RESTRICTED),
        (_PairState(other_restricted=True), DenialReason.OTHER_RESTRICTED),
        (_PairState(other_unavailable=True), DenialReason.PLAYER_UNAVAILABLE),
    ],
)
def test_bilateral_actions_deny_every_private_direction(state, reason):
    for action, rule in ACTION_POLICY.items():
        decision = decide_interaction(action, state)
        if rule is PolicyRule.BILATERAL:
            assert decision.allowed is False
            assert decision.denial_reason is reason


def test_shared_operational_content_survives_blocks_and_restrictions():
    decision = decide_interaction(
        InteractionAction.SHARED_OPERATIONAL_CONTENT,
        _PairState(
            viewer_blocks_other=True,
            other_blocks_viewer=True,
            viewer_restricted=True,
            other_restricted=True,
        ),
    )
    assert decision.allowed is True
    assert decision.denial_reason is None


def test_public_capability_never_reveals_other_players_denial_reason():
    capability = _public_capability(_PairState(other_blocks_viewer=True, other_restricted=True))
    assert capability["blocked_by_viewer"] is False
    assert capability["viewer_restricted"] is False
    assert "reason" not in capability
    assert capability["actions"][InteractionAction.DIRECT_MESSAGE.value] is False


def test_unavailable_exception_has_one_generic_public_message():
    decision = decide_interaction(
        InteractionAction.DIRECT_MESSAGE,
        _PairState(other_blocks_viewer=True),
    )
    assert str(InteractionUnavailable(decision)) == "Interaction unavailable"


def test_feature_services_do_not_query_user_blocks_directly():
    services = Path(__file__).parents[1] / "services"
    offenders = []
    for path in services.rglob("*.py"):
        if path.name == "interaction_policy.py":
            continue
        if "UserBlock" in path.read_text():
            offenders.append(path.name)
    assert offenders == []


@pytest.mark.asyncio
async def test_full_account_enforcement_blocks_incoming_pair_actions():
    blocks = MagicMock()
    blocks.all.return_value = []
    interaction_restrictions = MagicMock()
    interaction_restrictions.scalars.return_value.all.return_value = []
    account_restrictions = MagicMock()
    account_restrictions.scalars.return_value.all.return_value = [2]
    active_players = MagicMock()
    active_players.scalars.return_value.all.return_value = [1, 2]
    session = AsyncMock()
    session.execute.side_effect = [
        blocks,
        interaction_restrictions,
        account_restrictions,
        active_players,
    ]

    decision = await interaction_decision(session, 1, 2, InteractionAction.DIRECT_MESSAGE)

    assert decision.allowed is False
    assert decision.denial_reason is DenialReason.OTHER_RESTRICTED
