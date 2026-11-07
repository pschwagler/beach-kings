"""Compare games independent of row order, teammate order, and team orientation."""

from collections import Counter


def game_key(match, *, scores=True):
    teams = [tuple(sorted(str(player) for player in match[field])) for field in ("t1", "t2")]
    if any(len(team) != 2 for team in teams):
        raise ValueError("Each game must have exactly two players on each team")
    if not scores:
        return tuple(sorted(teams))
    score = match.get("s", "").split("-")
    if len(score) != 2 or not all(part.strip().isdigit() for part in score):
        return (tuple(teams), "unreadable")
    sides = [(teams[0], int(score[0])), (teams[1], int(score[1]))]
    return tuple(sorted(sides))


def evaluate(actual, expected):
    actual_games = Counter(game_key(game) for game in actual)
    expected_games = Counter(game_key(game) for game in expected)
    exact = sum((actual_games & expected_games).values())
    actual_teams = Counter(game_key(game, scores=False) for game in actual)
    expected_teams = Counter(game_key(game, scores=False) for game in expected)
    teams = sum((actual_teams & expected_teams).values())
    return {
        "expected_games": len(expected),
        "extracted_games": len(actual),
        "exact_games": exact,
        "correct_teams": teams,
        "precision": exact / len(actual) if actual else float(not expected),
        "recall": exact / len(expected) if expected else float(not actual),
        "all_games_correct": actual_games == expected_games,
    }
