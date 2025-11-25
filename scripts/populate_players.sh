#!/bin/bash

# Script to populate players by signing them up and verifying their phones using curl
# Since SMS is disabled, we query the database to get verification codes

set -e

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
DEFAULT_PASSWORD="Password123"

# Database connection info
POSTGRES_USER="${POSTGRES_USER:-beachkings}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-beachkings}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-beachkings}"

# Players to sign up
declare -a PLAYERS=(
    "Colan Gulla|+14012078049|Colan"
    "Daniel Minicucci|+15168804085|Dan"
    "Roger Subervi|+13473000141|Roger"
    "Chris Dedo|+13108901973|Dedo"
    "Ken Fowser|+19179457340|Ken"
    "Tim Cole|+15167612182|Tim"
    "Sami Jindyeh|+13479094448|Sami"
    "Connor Galaida|+18604880934|Connor"
    "Mark Gacki|+12017253921|Mark"
    "Matthew Balcer|+15612138939|Matt"
    "Antoine Marthey|+19173617509|Antoine"
    "Kevin Nardone|+19177511735|Kevin"
)

echo "🏐 Beach Kings - Player Population Script"
echo "=========================================="
echo "API URL: $API_BASE_URL"
echo "Database: $POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB"
echo "Players to process: ${#PLAYERS[@]}"
echo "=========================================="
echo ""

success_count=0
failed_count=0

# Function to get verification code from database
get_verification_code() {
    local phone_number=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c \
        "SELECT code FROM verification_codes WHERE phone_number = '$phone_number' AND used = false ORDER BY created_at DESC LIMIT 1;" \
        2>/dev/null | tr -d '[:space:]'
}

# Function to signup a player
signup_player() {
    local full_name=$1
    local phone=$2
    local nickname=$3
    
    echo "[$((success_count + failed_count + 1))/${#PLAYERS[@]}] Processing $full_name..."
    echo "  📝 Signing up $full_name ($phone)..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/api/auth/signup" \
        -H "Content-Type: application/json" \
        -d "{
            \"phone_number\": \"$phone\",
            \"password\": \"$DEFAULT_PASSWORD\",
            \"full_name\": \"$full_name\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo "  ✅ Signup successful"
        return 0
    elif [ "$http_code" -eq 400 ] && echo "$body" | grep -q "already registered"; then
        echo "  ⚠️  User already exists, will attempt verification"
        return 0
    else
        echo "  ❌ Signup failed: HTTP $http_code"
        echo "  Response: $body"
        return 1
    fi
}

# Function to verify phone
verify_phone() {
    local full_name=$1
    local phone=$2
    local code=$3
    
    echo "  🔐 Verifying phone with code $code..."
    
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/api/auth/verify-phone" \
        -H "Content-Type: application/json" \
        -d "{
            \"phone_number\": \"$phone\",
            \"code\": \"$code\"
        }")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo "  ✅ Verification successful!"
        return 0
    else
        echo "  ❌ Verification failed: HTTP $http_code"
        echo "  Response: $body"
        return 1
    fi
}

# Process each player
for player_data in "${PLAYERS[@]}"; do
    IFS='|' read -r full_name phone nickname <<< "$player_data"
    
    # Signup
    if signup_player "$full_name" "$phone" "$nickname"; then
        # Wait a bit for the code to be stored in database
        sleep 1
        
        # Get verification code from database
        code=$(get_verification_code "$phone")
        
        if [ -z "$code" ]; then
            echo "  ❌ Could not find verification code in database"
            failed_count=$((failed_count + 1))
        else
            # Verify phone
            if verify_phone "$full_name" "$phone" "$code"; then
                success_count=$((success_count + 1))
            else
                failed_count=$((failed_count + 1))
            fi
        fi
    else
        failed_count=$((failed_count + 1))
    fi
    
    # Wait between players to avoid rate limiting (10/minute = 6 seconds between requests)
    if [ $((success_count + failed_count)) -lt ${#PLAYERS[@]} ]; then
        echo "  ⏳ Waiting 7 seconds to avoid rate limiting..."
        sleep 7
    fi
    
    echo ""
done

echo "=========================================="
echo "✅ Successfully processed: $success_count"
echo "❌ Failed: $failed_count"
echo "=========================================="



