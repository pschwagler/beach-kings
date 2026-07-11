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
DEV_EMAIL="${EXPO_PUBLIC_DEV_USER_EMAIL:-}"
DEV_PASSWORD="${EXPO_PUBLIC_DEV_USER_PASSWORD:-}"

fail() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
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
  JAVA_HOME="$JAVA_HOME" PATH="${JAVA_HOME}/bin:${PATH}" maestro "$@"
}

open_sim_url() {
  local url="$1"
  xcrun simctl openurl "$SIMULATOR_UDID" "$url"
}

seed_social_data() {
  PYTHONPATH="${REPO_ROOT}/apps" "${REPO_ROOT}/venv/bin/python" - <<'PY'
import asyncio
import os
from sqlalchemy import select, delete, or_
from backend.database.db import AsyncSessionLocal
from backend.database.models import User, Player, FriendRequest, Friend
from backend.services.auth_service import hash_password
from backend.services import friend_service

TEST_PLAYERS = [
    {
        "phone": "+15550002222",
        "password": "test1234",
        "name": "Bob Test",
        "email": "bob@test.com",
        "gender": "male",
        "level": "AA",
        "location_id": "socal_la",
        "city": "Los Angeles",
        "state": "CA",
    },
    {
        "phone": "+15550003333",
        "password": "test1234",
        "name": "Carol Test",
        "email": "carol@test.com",
        "gender": "female",
        "level": "B",
        "location_id": "socal_sd",
        "city": "San Diego",
        "state": "CA",
    },
]

async def upsert_player(session, *, email, password, phone, name, gender, level, location_id, city, state):
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            phone_number=phone,
            email=email,
            password_hash=hash_password(password),
            is_verified=True,
        )
        session.add(user)
        await session.flush()
    else:
        user.password_hash = hash_password(password)
        user.is_verified = True

    result = await session.execute(select(Player).where(Player.user_id == user.id))
    player = result.scalar_one_or_none()
    if player is None:
        player = Player(user_id=user.id, is_placeholder=False)
        session.add(player)

    player.full_name = name
    player.gender = gender
    player.level = level
    player.location_id = location_id
    player.city = city
    player.state = state
    await session.flush()
    return player

async def main():
    dev_email = os.environ["EXPO_PUBLIC_DEV_USER_EMAIL"]
    dev_password = os.environ["EXPO_PUBLIC_DEV_USER_PASSWORD"]

    async with AsyncSessionLocal() as session:
        dev = await upsert_player(
            session,
            email=dev_email,
            password=dev_password,
            phone="+15559990000",
            name="Dev User",
            gender="female",
            level="A",
            location_id="socal_sd",
            city="San Diego",
            state="CA",
        )
        seeded = []
        for player in TEST_PLAYERS:
            seeded.append(await upsert_player(session, **player))

        ids = [dev.id, *[player.id for player in seeded]]
        await session.execute(
            delete(FriendRequest).where(
                or_(
                    FriendRequest.sender_player_id.in_(ids),
                    FriendRequest.receiver_player_id.in_(ids),
                )
            )
        )
        await session.execute(
            delete(Friend).where(or_(Friend.player1_id.in_(ids), Friend.player2_id.in_(ids)))
        )
        await session.commit()

        for sender in seeded:
            await friend_service.send_friend_request(session, sender.id, dev.id)
        await session.commit()

asyncio.run(main())
PY
}

require_cmd curl
require_cmd xcrun
require_cmd maestro

[ -x "${REPO_ROOT}/venv/bin/python" ] || fail "venv python not found at ${REPO_ROOT}/venv/bin/python"
[ -n "$DEV_EMAIL" ] || fail "EXPO_PUBLIC_DEV_USER_EMAIL is required"
[ -n "$DEV_PASSWORD" ] || fail "EXPO_PUBLIC_DEV_USER_PASSWORD is required"

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

seed_social_data

maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/auth-smoke.yaml"
maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/social-hub-smoke.yaml"
maestro_cmd check-syntax "${MOBILE_DIR}/.maestro/social-friend-request-accept.yaml"

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
  printf '%s\n' '- assertVisible: "BEACH LEAGUE"'
  printf '%s\n' '- tapOn: "I already have an account"'
  printf '%s\n' '- assertVisible: "Welcome back"'
  printf '%s\n' '- tapOn: "Dev quick login"'
  printf '%s\n' '- extendedWaitUntil:'
  printf '%s\n' '    visible: "BEACH LEAGUE"'
  printf '%s\n' '    timeout: 20000'
} >"$tmp_flow"

maestro_cmd --udid "$SIMULATOR_UDID" test "$tmp_flow"

open_sim_url "beach-league://social"
maestro_cmd --udid "$SIMULATOR_UDID" test "${MOBILE_DIR}/.maestro/social-hub-smoke.yaml"

seed_social_data

open_sim_url "beach-league://social?tab=friends"
maestro_cmd --udid "$SIMULATOR_UDID" test "${MOBILE_DIR}/.maestro/social-friend-request-accept.yaml"
