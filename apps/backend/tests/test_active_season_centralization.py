"""
Regression guard: active-season centralization invariants.

Statically scans backend source (no DB, no async) to enforce:

  (a) NO module outside services/league_data.py may compare Season.start_date
      or Season.end_date in the ACTIVE-WINDOW direction (start_date <= today,
      end_date >= today, and equivalents).  Such predicates signal active-season
      detection and must live only in _active_season_conditions /
      _is_season_active / resolve_active_season.

      Only the active direction is forbidden, so COMPLEMENT queries elsewhere
      (e.g. ``Season.end_date < today`` to find ENDED seasons for award
      finalization) are allowed without any file whitelist.

  (b) No function in any scanned module (except services/league_data.py) may
      simultaneously (i) join Session to Season via Session.season_id ==
      Season.id and (ii) reference Season.league_id.  League must always be
      derived from Session.league_id directly.

  (c) ``def resolve_active_season`` must appear EXACTLY ONCE across all
      scanned files and only in services/league_data.py.
      ``def get_or_create_active_season`` must appear ZERO times (the
      removed create-on-read helper must stay removed).

All checks operate on code-only token strings — comments and string
literals are stripped before scanning so docstrings that legitimately
describe forbidden patterns do not cause false positives.
"""

import ast
import io
import pathlib
import tokenize

# ---------------------------------------------------------------------------
# Root resolution
# ---------------------------------------------------------------------------

# This file lives at apps/backend/tests/test_active_season_centralization.py
# parents[1] resolves to apps/backend (the backend root).
BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]

# Canonical whitelisted module: the single-source-of-truth for active-season
# date logic.  This is the ONLY whitelist — check (a) targets the active-window
# direction specifically, so complement queries (ended / not-yet-started
# seasons) elsewhere need no carve-out.
_LEAGUE_DATA = BACKEND_ROOT / "services" / "league_data.py"


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------

def _scan_files() -> list[pathlib.Path]:
    """Return all *.py files under services/ and api/ (tests/ excluded)."""
    svc_files = list((BACKEND_ROOT / "services").glob("*.py"))
    api_files = list((BACKEND_ROOT / "api").rglob("*.py"))
    return svc_files + api_files


# ---------------------------------------------------------------------------
# Token-based comment/string stripping
# ---------------------------------------------------------------------------

#: Token types that carry no executable meaning (comments, strings, whitespace).
#: String literals are dropped to prevent docstrings and triple-quoted
#: constant values from producing false-positive pattern matches.
_DROP_TYPES: frozenset[int] = frozenset(
    filter(
        None,
        [
            tokenize.COMMENT,
            tokenize.STRING,
            tokenize.NL,
            tokenize.NEWLINE,
            tokenize.INDENT,
            tokenize.DEDENT,
            tokenize.ENCODING,
            tokenize.ENDMARKER,
            # Python 3.12+ f-string token types (may not exist on older runtimes).
            getattr(tokenize, "FSTRING_START", None),
            getattr(tokenize, "FSTRING_MIDDLE", None),
            getattr(tokenize, "FSTRING_END", None),
        ],
    )
)


def _code_only(source: str) -> str:
    """Strip comments and string literals; concatenate remaining tokens with NO separator.

    Concatenation (no separator) makes punctuation patterns deterministically
    searchable.  For example:

        ``Session.season_id == Season.id``  →  ``Session.season_id==Season.id``
        ``Season.end_date >= today``        →  ``Season.end_date>=today``

    Patterns are case-sensitive so ``Session`` (ORM model) is never confused
    with ``session`` (DB-handle variable).

    Trailing-token tokenize errors (common in code fragments) are tolerated.

    Args:
        source: Raw Python source text, either a full file or a function segment.

    Returns:
        A single string of concatenated non-whitespace, non-comment,
        non-string tokens.
    """
    parts: list[str] = []
    try:
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type not in _DROP_TYPES:
                parts.append(tok.string)
    except tokenize.TokenError:
        pass  # Trailing token error in code fragments is harmless.
    return "".join(parts)


def _code_only_file(path: pathlib.Path) -> str:
    """Read a file and return its code-only concatenated token string."""
    return _code_only(path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Check (a): no divergent active-season date logic
# ---------------------------------------------------------------------------

#: Forbidden substrings for check (a): comparisons that encode ACTIVE-WINDOW
#: membership specifically.  Membership is ``start_date <= today <= end_date``,
#: so the active directions are:
#:   - lower bound: ``Season.start_date <[=] today``  ≡  ``today >[=] Season.start_date``
#:   - upper bound: ``Season.end_date >[=] today``     ≡  ``today <[=] Season.end_date``
#: After no-separator token concatenation these become the substrings below.
#:
#: We deliberately forbid only the active directions — NOT all four operators —
#: so the legitimate COMPLEMENT queries are allowed without any file whitelist:
#:   - ``Season.end_date < today`` (find ENDED seasons, e.g. award finalization)
#:   - ``Season.start_date > today`` (find NOT-YET-STARTED seasons)
#: Equality (``==``) is also omitted: it is not an active-window check.
_DATE_PATTERNS: tuple[str, ...] = (
    # lower bound — start_date is at/before today
    "Season.start_date<=",
    "Season.start_date<",
    ">=Season.start_date",
    ">Season.start_date",
    # upper bound — end_date is at/after today
    "Season.end_date>=",
    "Season.end_date>",
    "<=Season.end_date",
    "<Season.end_date",
)


def _check_a_violations(files: list[pathlib.Path]) -> list[tuple[pathlib.Path, str]]:
    """Return (file, matched_pattern) pairs for check (a) violations."""
    violations: list[tuple[pathlib.Path, str]] = []
    for f in files:
        if f == _LEAGUE_DATA:
            continue
        code = _code_only_file(f)
        for pat in _DATE_PATTERNS:
            if pat in code:
                violations.append((f, pat))
    return violations


# ---------------------------------------------------------------------------
# Check (b): no Session→Season league derivation, per-function
# ---------------------------------------------------------------------------

#: Forbidden Session↔Season join patterns after token-concatenation.
_SESSION_SEASON_JOINS = (
    "Session.season_id==Season.id",
    "Season.id==Session.season_id",
)

#: The forbidden read that signals league derivation via the Season join.
_SEASON_LEAGUE_REF = "Season.league_id"


def _check_b_violations(
    files: list[pathlib.Path],
) -> list[tuple[pathlib.Path, str, int]]:
    """Return (file, function_name, lineno) for check (b) violations.

    The check is per-function (not per-file) to avoid coarse false positives
    from two unrelated functions in the same file that each contain only one
    half of the forbidden pattern.
    """
    violations: list[tuple[pathlib.Path, str, int]] = []
    for f in files:
        if f == _LEAGUE_DATA:
            continue
        full_source = f.read_text(encoding="utf-8")
        try:
            tree = ast.parse(full_source)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            segment = ast.get_source_segment(full_source, node)
            if segment is None:
                continue
            code = _code_only(segment)
            has_join = any(pat in code for pat in _SESSION_SEASON_JOINS)
            has_league_ref = _SEASON_LEAGUE_REF in code
            if has_join and has_league_ref:
                violations.append((f, node.name, node.lineno))
    return violations


# ---------------------------------------------------------------------------
# Check (c): single resolver, removed helper stays removed
#
# After token-concatenation (no separator) the following substrings identify
# function definitions:
#
#   ``def resolve_active_season(``
#     → tokens: NAME('def') NAME('resolve_active_season') OP('(')
#     → concatenated: ``defresolve_active_season(``
#
#   ``async def resolve_active_season(``
#     → tokens: NAME('async') NAME('def') NAME('resolve_active_season') OP('(')
#     → concatenated: ``asyncdefresolve_active_season(``
#
# We search for ``defresolve_active_season(`` which matches BOTH sync and async
# definitions because the ``async`` token is emitted before ``def``, and
# ``def`` is always immediately adjacent to the function name.
#
# Similarly, ``defget_or_create_active_season(`` catches both forms.
# ---------------------------------------------------------------------------

_RESOLVER_NEEDLE = "defresolve_active_season("
_REMOVED_HELPER_NEEDLE = "defget_or_create_active_season("


def _check_c_resolver_locations(
    files: list[pathlib.Path],
) -> list[pathlib.Path]:
    """Return every file where ``def resolve_active_season`` appears in code tokens."""
    return [f for f in files if _RESOLVER_NEEDLE in _code_only_file(f)]


def _check_c_removed_helper_locations(
    files: list[pathlib.Path],
) -> list[pathlib.Path]:
    """Return every file where ``def get_or_create_active_season`` appears in code tokens."""
    return [f for f in files if _REMOVED_HELPER_NEEDLE in _code_only_file(f)]


# ---------------------------------------------------------------------------
# Test functions
# ---------------------------------------------------------------------------


def test_no_divergent_active_season_date_logic() -> None:
    """Check (a): Season.start_date / Season.end_date must not be compared in
    the ACTIVE-WINDOW direction (start_date <= today, end_date >= today, and
    equivalents) outside services/league_data.py.

    Such comparisons implement the active-window predicate and must live
    exclusively in _active_season_conditions / _is_season_active /
    resolve_active_season inside league_data.py.

    Only the active direction is forbidden, so complement queries such as
    ``Season.end_date < today`` (ENDED seasons, e.g. award finalization) and
    ``Season.start_date > today`` (NOT-YET-STARTED seasons) are allowed
    anywhere without a file whitelist.
    """
    files = _scan_files()
    violations = _check_a_violations(files)

    messages = [
        f"  {f.relative_to(BACKEND_ROOT)!s}: matched {pat!r}\n"
        f"    Active-season date logic belongs only in resolve_active_season / "
        f"_active_season_conditions / _is_season_active in services/league_data.py."
        for f, pat in violations
    ]
    assert not violations, (
        "Check (a) failed — divergent active-season date logic found:\n"
        + "\n".join(messages)
    )


def test_no_session_season_league_derivation() -> None:
    """Check (b): no function may join Session→Season and read Season.league_id.

    League context must always be read from Session.league_id directly.
    A function that joins Session.season_id == Season.id to fetch Season.name
    or Season.scoring_system is fine as long as it does NOT then read
    Season.league_id.  Legitimate single-season validations like
    ``where(Season.id == season_id, Season.league_id == league_id)`` that
    start from a known season_id (not from a Session join) are also fine and
    are correctly excluded by the per-function check.
    """
    files = _scan_files()
    violations = _check_b_violations(files)

    messages = [
        f"  {f.relative_to(BACKEND_ROOT)!s}::{fn} (line {ln})\n"
        f"    League must be derived from Session.league_id, "
        f"not via a Session→Season join that reads Season.league_id."
        for f, fn, ln in violations
    ]
    assert not violations, (
        "Check (b) failed — Session→Season league derivation found:\n"
        + "\n".join(messages)
    )


def test_single_active_season_resolver() -> None:
    """Check (c): def resolve_active_season must appear exactly once, only in
    services/league_data.py.

    Multiple definitions would signal a competing resolver introducing its own
    date-window logic and breaking the single-source-of-truth invariant.
    """
    files = _scan_files()
    found = _check_c_resolver_locations(files)

    assert len(found) == 1, (
        f"Expected exactly 1 definition of resolve_active_season, "
        f"found {len(found)} in: {[str(f.relative_to(BACKEND_ROOT)) for f in found]}"
    )
    assert found[0] == _LEAGUE_DATA, (
        f"resolve_active_season must be defined only in services/league_data.py, "
        f"but found it in: {found[0].relative_to(BACKEND_ROOT)!s}"
    )


def test_removed_helper_stays_removed() -> None:
    """Check (c): def get_or_create_active_season must appear zero times.

    This helper was removed during the active-season centralization refactor.
    Reintroducing it would restore a create-on-read pattern that undermines
    the invariant that resolve_active_season is the single canonical resolver
    (and never creates).
    """
    files = _scan_files()
    found = _check_c_removed_helper_locations(files)

    assert not found, (
        f"get_or_create_active_season was removed and must stay removed. "
        f"Found definition(s) in: {[str(f.relative_to(BACKEND_ROOT)) for f in found]}"
    )


# ---------------------------------------------------------------------------
# Synthetic violation detection proofs (inline, no scratch files)
#
# These assertions run through the same helper functions against hand-crafted
# synthetic source strings and confirm that each check correctly detects the
# forbidden pattern.  They do NOT touch real source files.
# ---------------------------------------------------------------------------


def test_check_a_helper_detects_synthetic_violation() -> None:
    """Prove check (a) helper catches a synthetic Season.end_date >= comparison."""
    # Synthetic code that would live in a non-whitelisted module.
    synthetic = "active = Season.end_date >= today"
    code = _code_only(synthetic)

    # Confirm the tokenizer strips nothing meaningful here and the pattern appears.
    assert "Season.end_date>=today" in code, (
        f"Tokenizer produced unexpected output: {code!r}"
    )

    # Check that the pattern list contains the expected forbidden substring.
    assert "Season.end_date>=" in _DATE_PATTERNS
    assert "Season.start_date<=" in _DATE_PATTERNS

    # Simulate the per-file scan logic.
    detected = any(pat in code for pat in _DATE_PATTERNS)
    assert detected, "check (a) helper did NOT detect Season.end_date >= in synthetic source"

    # Confirm equality (==) is NOT flagged — it is not a range check.
    synthetic_eq = "Season.end_date == today"
    code_eq = _code_only(synthetic_eq)
    detected_eq = any(pat in code_eq for pat in _DATE_PATTERNS)
    assert not detected_eq, (
        "check (a) incorrectly flagged Season.end_date == (equality should be allowed)"
    )


def test_check_b_helper_detects_synthetic_violation() -> None:
    """Prove check (b) helper catches a synthetic Session→Season league join."""
    # A function that performs both the join AND reads Season.league_id.
    synthetic_func = """
async def bad_function(session):
    result = await session.execute(
        select(Session.league_id)
        .outerjoin(Season, Session.season_id == Season.id)
        .where(Season.league_id == some_id)
    )
    return result
"""
    code = _code_only(synthetic_func)

    has_join = any(pat in code for pat in _SESSION_SEASON_JOINS)
    has_league_ref = _SEASON_LEAGUE_REF in code

    assert has_join, (
        f"check (b) helper did NOT detect Session.season_id==Season.id in synthetic code.\n"
        f"code-only string: {code!r}"
    )
    assert has_league_ref, (
        f"check (b) helper did NOT detect Season.league_id in synthetic code.\n"
        f"code-only string: {code!r}"
    )
    assert has_join and has_league_ref, (
        "check (b) helper did NOT detect the full Session→Season league derivation pattern"
    )

    # Confirm a legitimate function (join present, but league from Session) is NOT flagged.
    synthetic_ok = """
async def ok_function(session):
    result = await session.execute(
        select(Season.name)
        .outerjoin(Season, Session.season_id == Season.id)
        .outerjoin(League, Session.league_id == League.id)
    )
    return result
"""
    code_ok = _code_only(synthetic_ok)
    has_join_ok = any(pat in code_ok for pat in _SESSION_SEASON_JOINS)
    has_league_ref_ok = _SEASON_LEAGUE_REF in code_ok
    assert not (has_join_ok and has_league_ref_ok), (
        "check (b) incorrectly flagged a legitimate join that reads league from Session"
    )


def test_check_c_helper_detects_synthetic_second_resolver() -> None:
    """Prove check (c) helper catches a synthetic duplicate resolver definition."""
    synthetic_sync = "def resolve_active_season(session, league_id): pass"
    synthetic_async = "async def resolve_active_season(session, league_id): pass"

    # Both sync and async forms must be detected.
    for src in (synthetic_sync, synthetic_async):
        code = _code_only(src)
        assert _RESOLVER_NEEDLE in code, (
            f"check (c) helper did NOT detect resolver definition in: {src!r}\n"
            f"code-only: {code!r}"
        )

    # Confirm the removed helper needle also works.
    synthetic_removed = "def get_or_create_active_season(session, league_id): pass"
    code_removed = _code_only(synthetic_removed)
    assert _REMOVED_HELPER_NEEDLE in code_removed, (
        f"check (c) helper did NOT detect get_or_create_active_season in: {synthetic_removed!r}\n"
        f"code-only: {code_removed!r}"
    )

    # Confirm an unrelated function is NOT flagged.
    synthetic_unrelated = "def get_active_user(session): pass"
    code_unrelated = _code_only(synthetic_unrelated)
    assert _RESOLVER_NEEDLE not in code_unrelated, (
        "check (c) incorrectly flagged an unrelated function name"
    )
