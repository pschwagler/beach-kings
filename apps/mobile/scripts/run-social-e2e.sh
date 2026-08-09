#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${MOBILE_DIR}/../.." && pwd)"

APP_ID="${APP_ID:-com.beachleague.app}"
BACKEND_URL="${BACKEND_URL:-${EXPO_PUBLIC_API_URL:-http://localhost:8000}}"
METRO_URL="${METRO_URL:-http://localhost:8081}"
SIMULATOR_UDID="${SIMULATOR_UDID:-booted}"
JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
CHECK_ONLY=0

usage() {
  cat <<'EOF'
Usage: run-social-e2e.sh [--check]

Runs the local Maestro smoke suite against an installed dev build.

Options:
  --check    Validate required tools, env vars, services, simulator, and flow
             syntax without seeding data or running Maestro flows.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --check | --check-only)
      CHECK_ONLY=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env"
  set +a
fi

if [ -f "${MOBILE_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${MOBILE_DIR}/.env"
  set +a
fi

BACKEND_URL="${BACKEND_URL:-${EXPO_PUBLIC_API_URL:-http://localhost:8000}}"
METRO_URL="${METRO_URL:-http://localhost:8081}"
E2E_RUN_ID=""
E2E_TEST_EMAIL=""
E2E_TEST_PASSWORD=""
E2E_REQUESTER_NAME=""

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

require_java() {
  env JAVA_HOME="$JAVA_HOME" PATH="${JAVA_HOME}/bin:${PATH}" java -version >/dev/null 2>&1 ||
    fail "Java is required for Maestro; set JAVA_HOME to a valid JDK/JRE"
}

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"

  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  fail "${label} is not reachable at ${url}"
}

maestro_cmd() {
  env JAVA_HOME="$JAVA_HOME" PATH="${JAVA_HOME}/bin:${PATH}" maestro "$@"
}

open_sim_url() {
  local url="$1"
  xcrun simctl openurl "$SIMULATOR_UDID" "$url"
}

prepare_social_fixture() {
  E2E_RUN_ID="${SOCIAL_E2E_RUN_ID:-$(python3 -c 'import secrets, time; print(f"{int(time.time())}-{secrets.token_hex(4)}")')}"
  if ! [[ "$E2E_RUN_ID" =~ ^[a-z0-9-]{1,48}$ ]]; then
    fail "SOCIAL_E2E_RUN_ID must contain only lowercase letters, digits, and hyphens (48 characters max)"
  fi

  local name_suffix="${E2E_RUN_ID: -8}"
  E2E_TEST_EMAIL="social-e2e-${E2E_RUN_ID}-runner@beachleague.test"
  E2E_TEST_PASSWORD="BkSocial$(python3 -c 'import secrets; print(secrets.token_hex(12))')"
  E2E_REQUESTER_NAME="Social E2E Bob ${name_suffix}"

  SOCIAL_E2E_RUN_ID="$E2E_RUN_ID" \
    SOCIAL_E2E_TEST_EMAIL="$E2E_TEST_EMAIL" \
    SOCIAL_E2E_TEST_PASSWORD="$E2E_TEST_PASSWORD" \
    PYTHONPATH="${REPO_ROOT}/apps" \
    "${REPO_ROOT}/venv/bin/python" - <<'PY'
import asyncio
import os
from urllib.parse import urlparse

database_url = os.getenv("DATABASE_URL")
database_host = (
    urlparse(database_url).hostname
    if database_url
    else os.getenv("POSTGRES_HOST", "localhost")
)
local_database_hosts = {
    None,
    "localhost",
    "127.0.0.1",
    "::1",
    "db",
    "postgres",
    "host.docker.internal",
}
if database_host not in local_database_hosts:
    raise RuntimeError(
        "Social E2E fixtures may only be added to a local database; "
        f"refusing database host {database_host!r}"
    )

from backend.database.db import AsyncSessionLocal
from backend.database.models import Location, Player, User
from backend.services.auth.auth_service import hash_password
from backend.services import friend_service
from sqlalchemy import select

run_id = os.environ["SOCIAL_E2E_RUN_ID"]
name_suffix = run_id[-8:]
test_password = os.environ["SOCIAL_E2E_TEST_PASSWORD"]

TEST_PLAYERS = (
    {
        "name": f"Social E2E Runner {name_suffix}",
        "email": os.environ["SOCIAL_E2E_TEST_EMAIL"],
        "gender": "male",
        "level": "AA",
        "city": "Los Angeles",
        "state": "CA",
    },
    {
        "name": f"Social E2E Bob {name_suffix}",
        "email": f"social-e2e-{run_id}-bob@beachleague.test",
        "gender": "male",
        "level": "AA",
        "city": "Los Angeles",
        "state": "CA",
    },
    {
        "name": f"Social E2E Carol {name_suffix}",
        "email": f"social-e2e-{run_id}-carol@beachleague.test",
        "gender": "female",
        "level": "B",
        "city": "San Diego",
        "state": "CA",
    },
)


async def create_player(
    session, *, email, name, gender, level, city, state, location_id
):
    user = User(
        email=email,
        password_hash=hash_password(test_password),
        is_verified=True,
    )
    session.add(user)
    await session.flush()

    player = Player(
        user_id=user.id,
        full_name=name,
        first_name=name.split()[0],
        last_name=" ".join(name.split()[1:]),
        gender=gender,
        level=level,
        location_id=location_id,
        city=city,
        state=state,
        is_placeholder=False,
    )
    session.add(player)
    await session.flush()
    return player


async def main():
    async with AsyncSessionLocal() as session:
        location_id = await session.scalar(select(Location.id).order_by(Location.id).limit(1))
        if location_id is None:
            raise RuntimeError("Social E2E fixtures require one existing location")

        runner, bob, carol = [
            await create_player(session, location_id=location_id, **player)
            for player in TEST_PLAYERS
        ]
        await friend_service.send_friend_request(session, bob.id, runner.id)
        await friend_service.send_friend_request(session, carol.id, runner.id)
        await session.commit()

asyncio.run(main())
PY
}

require_cmd curl
require_cmd xcrun
require_cmd maestro
require_java

if [ "$SIMULATOR_UDID" = "booted" ]; then
  SIMULATOR_UDID="$(
    xcrun simctl list devices booted |
      sed -n 's/.*(\([0-9A-Fa-f-][0-9A-Fa-f-]*\)) (Booted).*/\1/p' |
      head -1
  )"
  [ -n "$SIMULATOR_UDID" ] || fail "no booted iOS simulator found"
fi

wait_for_url "${BACKEND_URL}/api/health" "backend"
wait_for_url "${METRO_URL}/status" "Metro"

maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/auth-smoke.yaml"
maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/social-hub-smoke.yaml"
maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/social-friend-request-accept.yaml"
maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/sessions-games-smoke.yaml"

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf 'ok: E2E prerequisites and Maestro flow syntax verified\n'
  exit 0
fi

require_cmd python3
[ -x "${REPO_ROOT}/venv/bin/python" ] || fail "venv python not found at ${REPO_ROOT}/venv/bin/python"

prepare_social_fixture

encoded_metro_url="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$METRO_URL")"
xcrun simctl terminate "$SIMULATOR_UDID" "$APP_ID" >/dev/null 2>&1 || true
open_sim_url "${APP_ID}://expo-development-client/?url=${encoded_metro_url}"

tmp_flow="$(mktemp /tmp/beach-kings-dev-login.XXXXXX)"
trap 'rm -f "$tmp_flow"' EXIT
{
  printf 'appId: %s\n' "$APP_ID"
  printf '%s\n' '---'
  printf '%s\n' '- launchApp:'
  printf '%s\n' '    clearState: true'
  printf '%s\n' '    stopApp: true'
  # clearState does not clear the iOS Keychain, where expo-secure-store keeps
  # the session token — a simulator with a live session opens straight to
  # Home instead of the landing screen. When that happens (tab bar visible),
  # log out first so the credential-login steps below always apply.
  printf '%s\n' '- runFlow:'
  printf '%s\n' '    when:'
  printf '%s\n' '      visible: "Profile tab"'
  printf '%s\n' '    commands:'
  printf '%s\n' '      - tapOn: "Profile tab"'
  printf '%s\n' '      - tapOn: "Settings"'
  printf '%s\n' '      - scrollUntilVisible:'
  printf '%s\n' '          element:'
  printf '%s\n' '            id: "settings-logout-btn"'
  printf '%s\n' '          direction: DOWN'
  printf '%s\n' '      - tapOn:'
  printf '%s\n' '          id: "settings-logout-btn"'
  printf '%s\n' '      - tapOn:'
  printf '%s\n' '          id: "logout-confirm-btn"'
  printf '%s\n' '- assertVisible: "BEACH LEAGUE"'
  printf '%s\n' '- tapOn: "I already have an account"'
  printf '%s\n' '- assertVisible: "Welcome back"'
  printf '%s\n' '- tapOn:'
  printf '%s\n' '    text: "Email"'
  printf '%s\n' '    index: 0'
  printf '%s\n' "- inputText: \${E2E_TEST_EMAIL}"
  printf '%s\n' '- tapOn: "Password"'
  printf '%s\n' "- inputText: \${E2E_TEST_PASSWORD}"
  printf '%s\n' '- tapOn:'
  printf '%s\n' '    text: "Log In"'
  printf '%s\n' '    index: 1'
  printf '%s\n' '- extendedWaitUntil:'
  printf '%s\n' '    visible: "Home tab"'
  printf '%s\n' '    timeout: 20000'
} >"$tmp_flow"

maestro_cmd --udid "$SIMULATOR_UDID" test \
  --env "E2E_TEST_EMAIL=${E2E_TEST_EMAIL}" \
  --env "E2E_TEST_PASSWORD=${E2E_TEST_PASSWORD}" \
  "$tmp_flow"

open_sim_url "beach-league://social"
maestro_cmd --udid "$SIMULATOR_UDID" test "${MOBILE_DIR}/.maestro/social-hub-smoke.yaml"

open_sim_url "beach-league://social?tab=friends"
maestro_cmd --udid "$SIMULATOR_UDID" test \
  --env "E2E_REQUESTER_NAME=${E2E_REQUESTER_NAME}" \
  "${MOBILE_DIR}/.maestro/social-friend-request-accept.yaml"

open_sim_url "beach-league://add-games"
maestro_cmd --udid "$SIMULATOR_UDID" test "${MOBILE_DIR}/.maestro/sessions-games-smoke.yaml"
