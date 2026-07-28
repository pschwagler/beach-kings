"""Domain validation shared by every generic match write path."""

MATCH_SCORE_EMPTY_ERROR = "Enter a score before saving."
MATCH_SCORE_TIED_ERROR = (
    "Choose a winner by changing one score. Games cannot end in a tie."
)
MATCH_SCORE_NEGATIVE_ERROR = "Scores cannot be negative."


def validate_match_score(team1_score: int, team2_score: int) -> None:
    """Raise a user-readable ``ValueError`` when a game has no winner."""
    if team1_score < 0 or team2_score < 0:
        raise ValueError(MATCH_SCORE_NEGATIVE_ERROR)
    if team1_score == 0 and team2_score == 0:
        raise ValueError(MATCH_SCORE_EMPTY_ERROR)
    if team1_score == team2_score:
        raise ValueError(MATCH_SCORE_TIED_ERROR)
