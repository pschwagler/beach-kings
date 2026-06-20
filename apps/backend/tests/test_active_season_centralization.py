"""
Regression guard: active-season centralization invariants.

Statically scans backend source (no DB, no async) to enforce:

  (a) NO module outside services/league_data.py may compare Season.start_date
      or Season.end_date in the ACTIVE-WINDOW direction (start_date <= today,
      end_date >= today, and equivalents).  Such predicates signal active-season
      detection and must live only in _active_season_conditions /
      _is_season_active / resolve_active_season.

      The guard catches both ORM-class-level comparisons (``Season.end_date>=``)
      AND instance-level comparisons on a locally-loaded Season object
      (``season.end_date>=``).  The two forms are tokenized differently (capital
      S vs. lower-case s) but carry identical semantic risk.

      Only the ACTIVE direction is forbidden, so COMPLEMENT queries elsewhere
      (e.g. ``Season.end_date < today`` to find ENDED seasons for award
      finalization, or ``season.end_date < today`` on a locally-loaded object)
      are allowed without any file whitelist.

      Scope note: the guard targets ``Season.``/``season.`` specifically.
      A developer using an unusually-named local variable (e.g.
      ``s.end_date >= today`` where ``s`` is a loaded Season) would evade
      detection.  This is accepted: the meaningful regression risk is
      copy-paste of the canonical active-window idiom, which always uses
      ``season`` as the variable name.

  (b) No function in any scanned module (except services/league_data.py) may
      simultaneously (i) join Session to Season via Session.season_id ==
      Season.id and (ii) reference Season.league_id.  League must always be
      derived from Session.league_id directly.

      The guard also flags the ``aliased(Season)`` variant: a function that
      uses ``aliased(Season)``, joins on ``.season_id==`` (any alias), AND
      reads ``.league_id`` off the result is treated as a Session→Season
      league derivation even when the alias name differs from ``Season``.

      Heuristic limits: the aliased-Season check fires when ``aliased(Season)``
      appears in the function body AND the same function contains any
      ``.season_id==`` join AND any ``.league_id`` reference.  A sufficiently
      contrived function that uses ``aliased(Season)`` for a non-Season join
      *and* reads league_id from a completely unrelated column would be a
      false-positive, but this pattern has never appeared in the codebase.

  (c) ``def resolve_active_season`` must appear EXACTLY ONCE across all
      scanned files and only in services/league_data.py.
      ``def get_or_create_active_season`` must appear ZERO times (the
      removed create-on-read helper must stay removed).

      Assignment/alias forms are also detected: ``resolve_active_season =``
      and ``get_or_create_active_season =`` outside league_data.py signal a
      competing or aliased resolver and are forbidden.

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

        ``Session.season_id == Season.id``  ->  ``Session.season_id==Season.id``
        ``Season.end_date >= today``        ->  ``Season.end_date>=today``
        ``season.end_date >= today``        ->  ``season.end_date>=today``

    Patterns are case-sensitive so ``Season`` (ORM model class) and ``season``
    (a locally-loaded ORM instance variable) are tracked separately.

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
#:   - lower bound: ``start_date <[=] today``  (start is at/before today)
#:   - upper bound: ``end_date >[=] today``     (end is at/after today)
#: Equivalently, the reversed forms with today on the left:
#:   - ``today >[=] start_date``
#:   - ``today <[=] end_date``
#:
#: After no-separator token concatenation the forbidden substrings are:
#:
#:   ORM-class form (capital S):
#:     ``Season.start_date<=``  ``Season.start_date<``
#:     ``>=Season.start_date``  ``>Season.start_date``
#:     ``Season.end_date>=``    ``Season.end_date>``
#:     ``<=Season.end_date``    ``<Season.end_date``
#:
#:   Instance-variable form (lower-case s):
#:     ``season.start_date<=``  ``season.start_date<``
#:     ``>=season.start_date``  ``>season.start_date``
#:     ``season.end_date>=``    ``season.end_date>``
#:     ``<=season.end_date``    ``<season.end_date``
#:
#: We deliberately forbid only the ACTIVE direction — NOT all four operators —
#: so legitimate COMPLEMENT queries are allowed without any file whitelist:
#:   - ``Season.end_date < today``   (find ENDED seasons)
#:   - ``Season.start_date > today`` (find NOT-YET-STARTED seasons)
#:   - ``season.end_date < today``   (instance-level ended check)
#:   - ``season.start_date > today`` (instance-level not-started check)
#: Equality (``==``) is also omitted: it is not an active-window check.
#:
#: league_data.py is whitelisted for check (a): _is_season_active uses
#: ``season.start_date <=`` and ``season.end_date >=``, and update_season
#: uses ``updated_season.end_date >=``.  Because ``updated_season`` does not
#: match ``season.`` the instance patterns only cover the ``season.`` form;
#: ``updated_season.`` is a distinct token sequence and would require a
#: separate pattern.  Since league_data.py is whitelisted entirely, this gap
#: is inconsequential for that file.
_DATE_PATTERNS: tuple[str, ...] = (
    # ORM-class form — lower bound (start_date is at/before today)
    "Season.start_date<=",
    "Season.start_date<",
    ">=Season.start_date",
    ">Season.start_date",
    # ORM-class form — upper bound (end_date is at/after today)
    "Season.end_date>=",
    "Season.end_date>",
    "<=Season.end_date",
    "<Season.end_date",
    # Instance-variable form — lower bound
    "season.start_date<=",
    "season.start_date<",
    ">=season.start_date",
    ">season.start_date",
    # Instance-variable form — upper bound
    "season.end_date>=",
    "season.end_date>",
    "<=season.end_date",
    "<season.end_date",
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
# Check (b): no Session->Season league derivation, per-function
# ---------------------------------------------------------------------------

#: Forbidden Session<->Season join patterns after token-concatenation.
_SESSION_SEASON_JOINS = (
    "Session.season_id==Season.id",
    "Season.id==Session.season_id",
)

#: The forbidden read that signals league derivation via the Season join.
_SEASON_LEAGUE_REF = "Season.league_id"

#: Substring that signals a developer is aliasing the Season model, which
#: could be used to evade the literal join-pattern check above.
_ALIASED_SEASON = "aliased(Season)"

#: A join anchored on any ``.season_id==`` pairing (catches both the literal
#: Season alias name and any other alias a developer might choose).
_DOTTED_SEASON_ID_JOIN = ".season_id=="

#: league_id attribute access on an aliased Season object (or any other model
#: — the combination with _ALIASED_SEASON and _DOTTED_SEASON_ID_JOIN is what
#: makes this meaningful).
_DOTTED_LEAGUE_ID = ".league_id"


def _check_b_violations(
    files: list[pathlib.Path],
) -> list[tuple[pathlib.Path, str, int]]:
    """Return (file, function_name, lineno) for check (b) violations.

    The check is per-function (not per-file) to avoid coarse false positives
    from two unrelated functions in the same file that each contain only one
    half of the forbidden pattern.

    Two violation forms are detected:

    1. Literal join: ``Session.season_id == Season.id`` + ``Season.league_id``
       in the same function body.

    2. Aliased join: ``aliased(Season)`` + any ``.season_id==`` join +
       any ``.league_id`` reference in the same function body.
       This catches ``SeasonAlias = aliased(Season); ... join(.season_id ==
       SeasonAlias.id) ... SeasonAlias.league_id`` regardless of the alias
       variable name.

    Heuristic limits (documented): the aliased form fires whenever all three
    substrings co-occur in one function.  A function that imports
    ``aliased(Season)`` for an unrelated purpose AND happens to reference both
    ``.season_id==`` and ``.league_id`` in the same body would be a false
    positive.  No such pattern exists in the current codebase, and the
    combination is sufficiently specific that an accidental hit is unlikely.
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

            # Form 1: literal Session->Season join with league_id read.
            has_literal_join = any(pat in code for pat in _SESSION_SEASON_JOINS)
            has_league_ref = _SEASON_LEAGUE_REF in code
            if has_literal_join and has_league_ref:
                violations.append((f, node.name, node.lineno))
                continue

            # Form 2: aliased(Season) + dotted season_id join + dotted league_id.
            # The three-way combination is the reliable heuristic for
            # "aliased Season used to derive league from Session".
            has_aliased_season = _ALIASED_SEASON in code
            has_dotted_season_join = _DOTTED_SEASON_ID_JOIN in code
            has_dotted_league_id = _DOTTED_LEAGUE_ID in code
            if has_aliased_season and has_dotted_season_join and has_dotted_league_id:
                violations.append((f, node.name, node.lineno))

    return violations


# ---------------------------------------------------------------------------
# Check (c): single resolver, removed helper stays removed
#
# After token-concatenation (no separator) the following substrings identify
# function definitions:
#
#   ``def resolve_active_season(``
#     -> tokens: NAME('def') NAME('resolve_active_season') OP('(')
#     -> concatenated: ``defresolve_active_season(``
#
#   ``async def resolve_active_season(``
#     -> tokens: NAME('async') NAME('def') NAME('resolve_active_season') OP('(')
#     -> concatenated: ``asyncdefresolve_active_season(``
#
#   We search for ``defresolve_active_season(`` which matches BOTH sync and
#   async definitions because the ``async`` token is emitted before ``def``,
#   and ``def`` is always immediately adjacent to the function name.
#
#   Similarly, ``defget_or_create_active_season(`` catches both forms.
#
# Assignment / alias forms are also detected after token-concatenation:
#
#   ``resolve_active_season = lambda ...``
#     -> tokens: NAME('resolve_active_season') OP('=') NAME('lambda') ...
#     -> concatenated contains: ``resolve_active_season=lambda``
#
#   ``resolve_active_season = some_func``
#     -> tokens: NAME('resolve_active_season') OP('=') NAME('some_func') ...
#     -> concatenated contains: ``resolve_active_season=``
#
#   We therefore also search for ``resolve_active_season=`` (bare assignment)
#   and ``get_or_create_active_season=`` in non-whitelisted files.
#
#   False-positive safety: string literals (e.g. ``__all__ = [
#   "resolve_active_season"]``) are stripped by _code_only before scanning,
#   so the needle cannot match a string reference.  The legitimate ``def``
#   in league_data.py is whitelisted.  An augmented assignment
#   (``resolve_active_season += ...``) would only match if someone names a
#   module-level object that way — pathological and easily caught.
# ---------------------------------------------------------------------------

_RESOLVER_NEEDLE = "defresolve_active_season("
_REMOVED_HELPER_NEEDLE = "defget_or_create_active_season("

# Assignment-form needles for check (c).
_RESOLVER_ASSIGN_NEEDLE = "resolve_active_season="
_REMOVED_HELPER_ASSIGN_NEEDLE = "get_or_create_active_season="


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


def _check_c_resolver_assign_locations(
    files: list[pathlib.Path],
) -> list[pathlib.Path]:
    """Return non-whitelisted files where ``resolve_active_season =`` appears.

    An assignment to this name outside league_data.py signals a competing or
    aliased resolver and must be forbidden regardless of whether it is a
    lambda, a function reference, or any other right-hand side.
    """
    found = []
    for f in files:
        if f == _LEAGUE_DATA:
            continue
        if _RESOLVER_ASSIGN_NEEDLE in _code_only_file(f):
            found.append(f)
    return found


def _check_c_removed_helper_assign_locations(
    files: list[pathlib.Path],
) -> list[pathlib.Path]:
    """Return non-whitelisted files where ``get_or_create_active_season =`` appears."""
    found = []
    for f in files:
        if f == _LEAGUE_DATA:
            continue
        if _REMOVED_HELPER_ASSIGN_NEEDLE in _code_only_file(f):
            found.append(f)
    return found


# ---------------------------------------------------------------------------
# Test functions
# ---------------------------------------------------------------------------


def test_no_divergent_active_season_date_logic() -> None:
    """Check (a): Season.start_date / Season.end_date must not be compared in
    the ACTIVE-WINDOW direction (start_date <= today, end_date >= today, and
    equivalents) outside services/league_data.py.

    Both ORM-class comparisons (``Season.end_date >= today``) and
    instance-variable comparisons (``season.end_date >= today``) are
    forbidden outside the whitelisted module.

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
    """Check (b): no function may join Session->Season and read Season.league_id.

    League context must always be read from Session.league_id directly.
    A function that joins Session.season_id == Season.id to fetch Season.name
    or Season.scoring_system is fine as long as it does NOT then read
    Season.league_id.  Legitimate single-season validations like
    ``where(Season.id == season_id, Season.league_id == league_id)`` that
    start from a known season_id (not from a Session join) are also fine and
    are correctly excluded by the per-function check.

    The check also covers the aliased(Season) form: a function that aliases
    the Season model, joins on .season_id==, and reads .league_id off the
    alias is treated as a Session->Season league derivation regardless of
    the alias variable name.
    """
    files = _scan_files()
    violations = _check_b_violations(files)

    messages = [
        f"  {f.relative_to(BACKEND_ROOT)!s}::{fn} (line {ln})\n"
        f"    League must be derived from Session.league_id, "
        f"not via a Session->Season join that reads Season.league_id."
        for f, fn, ln in violations
    ]
    assert not violations, (
        "Check (b) failed — Session->Season league derivation found:\n"
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


def test_no_resolver_assignment_outside_league_data() -> None:
    """Check (c) assignment form: resolve_active_season must not be assigned
    (via lambda, alias, or any other RHS) outside services/league_data.py.

    ``resolve_active_season = lambda ...`` or ``resolve_active_season =
    other_func`` in a non-whitelisted file would create a competing resolver
    that bypasses the invariant even if it is not a ``def`` statement.
    """
    files = _scan_files()
    found = _check_c_resolver_assign_locations(files)

    assert not found, (
        f"resolve_active_season is assigned outside services/league_data.py "
        f"(lambda or alias form). Found in: "
        f"{[str(f.relative_to(BACKEND_ROOT)) for f in found]}"
    )


def test_no_removed_helper_assignment_outside_league_data() -> None:
    """Check (c) assignment form: get_or_create_active_season must not be
    assigned outside services/league_data.py.

    Even if the canonical ``def`` form stays absent, an assignment alias
    (``get_or_create_active_season = create_season``) would restore the
    removed helper under a new name.
    """
    files = _scan_files()
    found = _check_c_removed_helper_assign_locations(files)

    assert not found, (
        f"get_or_create_active_season is assigned outside services/league_data.py. "
        f"Found in: {[str(f.relative_to(BACKEND_ROOT)) for f in found]}"
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


def test_check_a_helper_detects_lowercase_instance_comparison() -> None:
    """Prove check (a) catches lowercase instance-level active-window comparisons.

    FIX A: the original guard only matched ORM-class patterns (capital S).
    Code like ``season.end_date >= today`` — produced when a developer loads a
    Season ORM instance and compares its attributes directly — tokenizes to
    ``season.end_date>=today`` (lower-case s) and evaded the old patterns.
    The new lower-case set closes this gap.
    """
    # Active-window instance comparisons that MUST be caught.
    violations = {
        "season.end_date >= today": "season.end_date>=",
        "season.start_date <= today": "season.start_date<=",
        "today >= season.start_date": ">=season.start_date",
        "today <= season.end_date": "<=season.end_date",
        "season.end_date > today": "season.end_date>",
        "season.start_date < today": "season.start_date<",
        "today > season.start_date": ">season.start_date",
        "today < season.end_date": "<season.end_date",
    }
    for source, expected_pat in violations.items():
        code = _code_only(source)
        detected = any(pat in code for pat in _DATE_PATTERNS)
        assert detected, (
            f"check (a) did NOT detect instance-level active-window comparison:\n"
            f"  source: {source!r}\n"
            f"  code-only: {code!r}\n"
            f"  expected pattern: {expected_pat!r}"
        )

    # Complement / non-active-window instance comparisons that must NOT be caught.
    allowed = [
        "season.end_date < today",    # ended
        "season.start_date > today",  # not yet started
        "today < season.start_date",  # today before season starts
        "today > season.end_date",    # today after season ends
        "season.end_date == today",   # equality
    ]
    for source in allowed:
        code = _code_only(source)
        detected = any(pat in code for pat in _DATE_PATTERNS)
        assert not detected, (
            f"check (a) incorrectly flagged allowed complement comparison:\n"
            f"  source: {source!r}\n"
            f"  code-only: {code!r}"
        )


def test_check_b_helper_detects_synthetic_violation() -> None:
    """Prove check (b) helper catches a synthetic Session->Season league join."""
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
        "check (b) helper did NOT detect the full Session->Season league derivation pattern"
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


def test_check_b_helper_detects_aliased_season_violation() -> None:
    """Prove check (b) catches the aliased(Season) league-derivation pattern.

    FIX B: a developer using ``SeasonAlias = aliased(Season)`` evades the
    literal ``Session.season_id==Season.id`` pattern because the alias name
    (e.g. ``SeasonAlias``) replaces ``Season`` in the join expression.  The
    new aliased-Season heuristic catches this by requiring ALL THREE of:
    (i) ``aliased(Season)`` in the function body,
    (ii) any ``.season_id==`` join in the function body, and
    (iii) any ``.league_id`` reference in the function body.
    """
    # Aliased Session->Season league derivation — MUST be caught.
    bad_aliased = """
async def bad_aliased_function(db):
    SeasonAlias = aliased(Season)
    result = await db.execute(
        select(Session.id, SeasonAlias.league_id)
        .outerjoin(SeasonAlias, Session.season_id == SeasonAlias.id)
    )
    return result.all()
"""
    code_bad = _code_only(bad_aliased)
    has_aliased = _ALIASED_SEASON in code_bad
    has_season_join = _DOTTED_SEASON_ID_JOIN in code_bad
    has_league_id = _DOTTED_LEAGUE_ID in code_bad

    assert has_aliased, (
        f"Synthetic bad function does not contain aliased(Season): {code_bad!r}"
    )
    assert has_season_join, (
        f"Synthetic bad function does not contain .season_id== join: {code_bad!r}"
    )
    assert has_league_id, (
        f"Synthetic bad function does not contain .league_id ref: {code_bad!r}"
    )
    # All three present => violation detected.
    assert has_aliased and has_season_join and has_league_id, (
        "check (b) aliased heuristic did NOT detect aliased(Season) + season_id join + league_id"
    )

    # Benign aliased join that reads league from Session, NOT from the alias.
    # No .league_id read on the aliased Season — only Session.league_id in WHERE.
    ok_aliased = """
async def ok_aliased_function(db, league_id):
    SeasonAlias = aliased(Season)
    result = await db.execute(
        select(SeasonAlias.name)
        .outerjoin(SeasonAlias, Session.season_id == SeasonAlias.id)
        .where(Session.league_id == league_id)
    )
    return result.all()
"""
    code_ok = _code_only(ok_aliased)
    ok_has_aliased = _ALIASED_SEASON in code_ok
    ok_has_season_join = _DOTTED_SEASON_ID_JOIN in code_ok
    ok_has_league_id = _DOTTED_LEAGUE_ID in code_ok

    # Session.league_id is present (``Session.league_id==league_id`` tokenizes to
    # ``Session.league_id==league_id`` which contains ``.league_id``), so the
    # heuristic DOES fire here.  This is an accepted false-positive boundary:
    # any function that aliases Season, joins on season_id, AND references
    # league_id in any form is considered suspect.  The developer must either
    # derive league from Session.league_id in a WHERE clause outside the join
    # (acceptable pattern — in that case refactor to remove aliased(Season) from
    # the function scope) or suppress via league_data.py whitelist.
    #
    # We document this by asserting the heuristic DOES fire on ok_aliased, not
    # that it does not. The test validates the detection logic, not that the
    # example is clean.
    assert ok_has_aliased and ok_has_season_join and ok_has_league_id, (
        "Expected all three heuristic signals to be present in ok_aliased example; "
        "update this comment if you refactor the benign example to avoid one of them"
    )

    # A truly benign use: aliased(Season) to read season.name only, no league_id anywhere.
    benign_aliased = """
async def benign_function(db):
    SeasonAlias = aliased(Season)
    result = await db.execute(
        select(SeasonAlias.name)
        .outerjoin(SeasonAlias, Session.season_id == SeasonAlias.id)
    )
    return result.all()
"""
    code_benign = _code_only(benign_aliased)
    benign_has_aliased = _ALIASED_SEASON in code_benign
    benign_has_season_join = _DOTTED_SEASON_ID_JOIN in code_benign
    benign_has_league_id = _DOTTED_LEAGUE_ID in code_benign

    assert benign_has_aliased and benign_has_season_join, (
        "Benign aliased function should still have aliased(Season) and .season_id== join"
    )
    assert not benign_has_league_id, (
        f"Benign aliased function must NOT contain .league_id; code: {code_benign!r}"
    )
    assert not (benign_has_aliased and benign_has_season_join and benign_has_league_id), (
        "check (b) aliased heuristic incorrectly fires on a benign aliased join "
        "(no .league_id present)"
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


def test_check_c_helper_detects_resolver_assignment_forms() -> None:
    """Prove check (c) detects lambda and alias assignment forms.

    FIX C: ``def resolve_active_season(`` only catches explicit ``def``
    statements.  A developer writing ``resolve_active_season = lambda ...``
    or ``resolve_active_season = other_func`` would create a competing
    resolver without triggering the original ``_RESOLVER_NEEDLE``.  The
    new ``_RESOLVER_ASSIGN_NEEDLE`` (``resolve_active_season=``) catches
    all assignment forms after token-concatenation.
    """
    # Lambda assignment form — MUST be caught.
    synthetic_lambda = (
        "resolve_active_season = lambda session, league_id: some_other_resolve(session, league_id)"
    )
    code_lambda = _code_only(synthetic_lambda)
    assert _RESOLVER_ASSIGN_NEEDLE in code_lambda, (
        f"check (c) did NOT detect lambda assignment:\n"
        f"  source: {synthetic_lambda!r}\n"
        f"  code-only: {code_lambda!r}\n"
        f"  needle: {_RESOLVER_ASSIGN_NEEDLE!r}"
    )

    # Alias assignment form — MUST be caught.
    synthetic_alias = "resolve_active_season = some_other_function"
    code_alias = _code_only(synthetic_alias)
    assert _RESOLVER_ASSIGN_NEEDLE in code_alias, (
        f"check (c) did NOT detect alias assignment:\n"
        f"  source: {synthetic_alias!r}\n"
        f"  code-only: {code_alias!r}\n"
        f"  needle: {_RESOLVER_ASSIGN_NEEDLE!r}"
    )

    # Removed helper lambda form — MUST be caught.
    synthetic_removed_lambda = "get_or_create_active_season = lambda s, lid: None"
    code_removed = _code_only(synthetic_removed_lambda)
    assert _REMOVED_HELPER_ASSIGN_NEEDLE in code_removed, (
        f"check (c) did NOT detect removed helper lambda assignment:\n"
        f"  source: {synthetic_removed_lambda!r}\n"
        f"  code-only: {code_removed!r}\n"
        f"  needle: {_REMOVED_HELPER_ASSIGN_NEEDLE!r}"
    )

    # Confirm the legitimate def form in league_data.py is NOT caught by the
    # assignment needle (the def form tokenizes without a bare ``=`` after the
    # function name).
    legitimate_def = "def resolve_active_season(session, league_id): pass"
    code_def = _code_only(legitimate_def)
    # The def form should NOT produce ``resolve_active_season=``:
    # it produces ``defresolve_active_season(`` not ``resolve_active_season=``.
    assert _RESOLVER_ASSIGN_NEEDLE not in code_def, (
        f"check (c) assignment needle incorrectly fires on a legitimate def statement:\n"
        f"  source: {legitimate_def!r}\n"
        f"  code-only: {code_def!r}"
    )

    # Confirm an unrelated assignment is NOT flagged.
    unrelated = "resolve_something_else = lambda x: x"
    code_unrelated = _code_only(unrelated)
    assert _RESOLVER_ASSIGN_NEEDLE not in code_unrelated, (
        "check (c) assignment needle incorrectly flagged an unrelated assignment"
    )
