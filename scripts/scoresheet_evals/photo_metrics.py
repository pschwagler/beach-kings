"""Photo-grounded acceptance sets, independent of production-only identity facts.

References must be human-annotated from visible text, never generated from a
candidate model's predictions. Exact production-ID metrics remain separate.
"""

from itertools import product


def _name(value):
    return str(value).strip().casefold()


def _compatible(value, slot):
    if type(value) is int:
        return value in slot["acceptable_player_ids"]
    return _name(value) in {_name(name) for name in slot["acceptable_names"]}


def _alignments(actual, reference):
    scores = actual.get("s", "").split("-")
    if len(scores) != 2:
        return
    for swap, reverse1, reverse2 in product((False, True), repeat=3):
        teams = [actual["t1"], actual["t2"]]
        values = scores[:]
        if swap:
            teams.reverse()
            values.reverse()
        teams = [
            list(reversed(team)) if reverse else team
            for team, reverse in zip(teams, (reverse1, reverse2))
        ]
        slots = reference["t1"] + reference["t2"]
        players = teams[0] + teams[1]
        if len(players) != 4:
            continue
        correct = [_compatible(player, slot) for player, slot in zip(players, slots)]
        score_ok = "-".join(value.strip() for value in values) == reference["s"]
        yield sum(correct) + 5 * score_ok, all(correct) and score_ok, players, slots


def _best(actual, reference):
    return max(
        _alignments(actual, reference), key=lambda result: result[0], default=(0, False, [], [])
    )


def evaluate_photo(actual, references):
    reviewed = [row for row in references if not row.get("needs_label_review", False)]
    excluded = [row for row in references if row.get("needs_label_review", False)]
    # Maximum bipartite matching prevents duplicated games receiving credit and
    # does not require models to preserve row, teammate, or team orientation.
    edges = [
        [index for index, ref in enumerate(reviewed) if _best(game, ref)[1]] for game in actual
    ]
    matched = {}

    def augment(index, seen):
        for target in edges[index]:
            if target in seen:
                continue
            seen.add(target)
            if target not in matched or augment(matched[target], seen):
                matched[target] = index
                return True
        return False

    for index in range(len(actual)):
        augment(index, set())
    alignments = [(actual[index], reviewed[target]) for target, index in matched.items()]
    # A pending transcription label is unscored, not automatically correct.
    pending_candidates = set(range(len(actual))) - set(matched.values())
    pending_matched = 0
    for ref in excluded:
        eligible = [(index, _best(actual[index], ref)[0]) for index in pending_candidates]
        if eligible:
            index, quality = max(eligible, key=lambda item: item[1])
            if quality >= 8:  # Correct scores and at least three visible player slots.
                pending_candidates.remove(index)
                pending_matched += 1
                alignments.append((actual[index], ref))
    abstentions = guesses = unique_names = 0
    for game, ref in alignments:
        _, _, players, slots = _best(game, ref)
        for player, slot in zip(players, slots):
            if slot.get("needs_label_review") or not _compatible(player, slot):
                continue
            ambiguous = len(slot["acceptable_player_ids"]) > 1
            abstentions += ambiguous and type(player) is not int
            guesses += ambiguous and type(player) is int
            unique_names += not ambiguous and type(player) is not int
    count = len(matched)
    denominator = len(actual) - pending_matched
    return {
        "reviewed_reference_games": len(reviewed),
        "pending_label_review_games": len(excluded),
        "photo_consistent_games": count,
        "photo_recall": count / len(reviewed) if reviewed else None,
        "photo_precision": count / denominator if denominator else None,
        "appropriate_ambiguous_abstentions": abstentions,
        "ambiguous_identity_selections": guesses,
        "correct_unresolved_unique_names": unique_names,
    }
