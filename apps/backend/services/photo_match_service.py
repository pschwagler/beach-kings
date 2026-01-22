"""
Photo Match Service for processing uploaded images of game scores.

This service handles:
- Image preprocessing (JPEG conversion, downscaling)
- OpenAI GPT-5-mini vision API integration
- Player name fuzzy matching against league members
- Redis session management for conversation state
- Match creation from parsed data
"""

import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from difflib import SequenceMatcher
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple, Union

from openai import AsyncOpenAI
from PIL import Image
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import db
from backend.database.models import PhotoMatchJob, PhotoMatchJobStatus
from backend.services import data_service
from backend.services import redis_service
from backend.utils.datetime_utils import utcnow

logger = logging.getLogger(__name__)

# Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = "gpt-4.1-mini"
OPENAI_CLARIFY_MODEL = "gpt-4.1-nano" # revert to "gpt-5-nano" if accuracy issues
MAX_IMAGE_HEIGHT = 512
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
SESSION_TTL_SECONDS = 900  # 15 minutes

# Redis key prefix for photo match sessions
REDIS_KEY_PREFIX = "photo_match_session:"

# OpenAI client (singleton)
_openai_client: Optional[AsyncOpenAI] = None


def get_openai_client() -> AsyncOpenAI:
    """Get or create OpenAI client."""
    global _openai_client
    if _openai_client is None:
        if not OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY environment variable is not set")
        _openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    return _openai_client


# ============================================================================
# Image Preprocessing
# ============================================================================

def validate_image_file(
    file_content: bytes,
    content_type: str,
    filename: str
) -> Tuple[bool, str]:
    """
    Validate uploaded image file.
    
    Args:
        file_content: Raw file bytes
        content_type: MIME type from upload
        filename: Original filename
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    # Check file size
    if len(file_content) > MAX_IMAGE_SIZE_BYTES:
        return False, f"File size exceeds maximum of {MAX_IMAGE_SIZE_BYTES // (1024*1024)}MB"
    
    # Check extension
    ext = os.path.splitext(filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # Try to open with PIL to validate it's a real image
    try:
        img = Image.open(BytesIO(file_content))
        img.verify()  # Verify it's a valid image
    except Exception as e:
        return False, f"Invalid or corrupted image file: {str(e)}"
    
    return True, ""


def preprocess_image(image_bytes: bytes) -> Tuple[bytes, str]:
    """
    Convert image to JPEG and downscale to max height ~400px.
    
    Args:
        image_bytes: Raw image bytes
        
    Returns:
        Tuple of (processed_bytes, base64_encoded_string)
    """
    # Open image
    img = Image.open(BytesIO(image_bytes))
    
    # Convert to RGB if necessary (handles RGBA, P mode, etc.)
    if img.mode in ('RGBA', 'P', 'LA'):
        # Create white background for transparency
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    # Downscale if needed (maintain aspect ratio)
    if img.height > MAX_IMAGE_HEIGHT:
        ratio = MAX_IMAGE_HEIGHT / img.height
        new_width = int(img.width * ratio)
        img = img.resize((new_width, MAX_IMAGE_HEIGHT), Image.Resampling.LANCZOS)
    
    # Save as JPEG
    output = BytesIO()
    img.save(output, format='JPEG', quality=85, optimize=True)
    processed_bytes = output.getvalue()
    
    # Encode to base64
    base64_encoded = base64.b64encode(processed_bytes).decode('utf-8')
    
    logger.info(f"Image preprocessed: {len(image_bytes)} -> {len(processed_bytes)} bytes, "
                f"dimensions: {img.width}x{img.height}")
    
    return processed_bytes, base64_encoded


# ============================================================================
# Redis Session Management
# ============================================================================

def generate_session_id() -> str:
    """Generate a unique session ID."""
    return str(uuid.uuid4())


def _make_redis_key(session_id: str) -> str:
    """Create the Redis key for a session."""
    return f"{REDIS_KEY_PREFIX}{session_id}"


async def store_session_data(
    session_id: str,
    data: Dict[str, Any],
    expiry_seconds: int = SESSION_TTL_SECONDS
) -> bool:
    """
    Store session data in Redis with TTL.
    
    Args:
        session_id: Unique session identifier
        data: Session data dictionary
        expiry_seconds: TTL in seconds (default 15 minutes)
        
    Returns:
        True if successful, False otherwise
    """
    redis_key = _make_redis_key(session_id)
    json_data = json.dumps(data, default=str)
    
    success = await redis_service.redis_set(redis_key, json_data, expiry_seconds)
    if success:
        logger.debug(f"Stored session data for {session_id}")
    else:
        logger.error(f"Failed to store session data for {session_id}")
    return success


async def get_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Get session data from Redis.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        Session data dictionary or None if not found
    """
    redis_key = _make_redis_key(session_id)
    
    try:
        data = await redis_service.redis_get(redis_key)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Error getting session data: {e}")
        return None


async def update_session_data(
    session_id: str,
    updates: Dict[str, Any],
    refresh_ttl: bool = True
) -> bool:
    """
    Update existing session data in Redis.
    
    Args:
        session_id: Unique session identifier
        updates: Dictionary of fields to update
        refresh_ttl: Whether to refresh the TTL
        
    Returns:
        True if successful, False otherwise
    """
    existing = await get_session_data(session_id)
    if existing is None:
        logger.warning(f"Session {session_id} not found for update")
        return False
    
    existing.update(updates)
    existing["last_updated"] = utcnow().isoformat()
    
    return await store_session_data(session_id, existing)


async def cleanup_session(session_id: str) -> bool:
    """
    Delete session data from Redis.
    
    Args:
        session_id: Unique session identifier
        
    Returns:
        True if successful, False otherwise
    """
    redis_key = _make_redis_key(session_id)
    success = await redis_service.redis_delete(redis_key)
    if success:
        logger.debug(f"Cleaned up session {session_id}")
    return success


# ============================================================================
# Player Name Matching
# ============================================================================

def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two names using SequenceMatcher.
    
    Args:
        name1: First name
        name2: Second name
        
    Returns:
        Similarity score between 0 and 1
    """
    # Normalize names
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()
    
    return SequenceMatcher(None, n1, n2).ratio()


def match_player_name(
    extracted_name: str,
    league_members: List[Dict]
) -> Optional[Dict]:
    """
    Fuzzy match extracted player name against league members.
    
    Args:
        extracted_name: Name extracted from image
        league_members: List of league member dictionaries
        
    Returns:
        Dict with player_id, confidence, matched_name or None if no match
    """
    if not extracted_name or not league_members:
        return None
    
    best_match = None
    best_score = 0.0
    
    for member in league_members:
        player_name = member.get("player_name", "")
        player_nickname = member.get("player_nickname", "")
        player_id = member.get("player_id")
        
        # Check full name match
        score = calculate_name_similarity(extracted_name, player_name)
        
        # Check nickname match (high confidence if exact or close match)
        if player_nickname:
            nickname_score = calculate_name_similarity(extracted_name, player_nickname)
            if nickname_score > 0.9:  # Strong nickname match
                score = max(score, 0.95)
            elif nickname_score > 0.7:
                score = max(score, 0.85)
        
        # Check if extracted name is a partial match of full name
        if extracted_name.lower() in player_name.lower():
            score = max(score, 0.8)
        
        # Check first name only
        first_name = player_name.split()[0] if player_name else ""
        if first_name:
            first_name_score = calculate_name_similarity(extracted_name, first_name)
            if first_name_score > 0.9:  # Strong first name match
                score = max(score, 0.85)
        
        if score > best_score:
            best_score = score
            best_match = {
                "player_id": player_id,
                "confidence": score,
                "matched_name": player_name
            }
    
    # Only return if confidence is above threshold
    if best_match and best_match["confidence"] >= 0.6:
        return best_match
    
    return None


def expand_compact_response(compact: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expand compact JSON response from AI to verbose format for processing.
    
    Compact format:
        {"st":"success","m":[{"n":1,"t1":[5,12],"t2":[3,8],"s":[21,19]}],"q":null}
    
    Verbose format:
        {"status":"success","matches":[{"match_number":1,"team1_player1":{"id":5},...}],...}
    
    Args:
        compact: Compact JSON response from AI
        
    Returns:
        Expanded verbose format for processing
    """
    result = {
        "status": compact.get("st", "failed"),
        "matches": [],
        "clarification_question": compact.get("q"),
        "error_message": compact.get("err")
    }
    
    for m in compact.get("m", []):
        t1 = m.get("t1", [None, None])
        t2 = m.get("t2", [None, None])
        scores = m.get("s", [0, 0])
        
        # Convert player references - can be int (ID) or string (unmatched name)
        def to_player_dict(val: Union[int, str, None]) -> Dict:
            if val is None:
                return {"id": None, "name": ""}
            if isinstance(val, int):
                return {"id": val, "name": ""}
            # String means unmatched name
            return {"id": None, "name": str(val)}
        
        # Preserve None for unclear scores (don't default to 0)
        team1_score = scores[0] if len(scores) > 0 else None
        team2_score = scores[1] if len(scores) > 1 else None
        
        match = {
            "match_number": m.get("n", 1),
            "team1_player1": to_player_dict(t1[0] if len(t1) > 0 else None),
            "team1_player2": to_player_dict(t1[1] if len(t1) > 1 else None),
            "team2_player1": to_player_dict(t2[0] if len(t2) > 0 else None),
            "team2_player2": to_player_dict(t2[1] if len(t2) > 1 else None),
            "team1_score": team1_score,
            "team2_score": team2_score,
        }
        result["matches"].append(match)
    
    return result


def is_compact_format(response: Dict[str, Any]) -> bool:
    """Check if response is in compact format (has 'st' key) vs verbose ('status' key)."""
    return "st" in response and "status" not in response


def match_all_players_in_matches(
    parsed_matches: List[Dict],
    league_members: List[Dict]
) -> Tuple[List[Dict], List[str]]:
    """
    Match all player names in parsed matches to league members.
    
    Args:
        parsed_matches: List of match dictionaries with player names
        league_members: List of league member dictionaries
        
    Returns:
        Tuple of (matches_with_ids, unmatched_names)
    """
    unmatched_names = []
    result_matches = []
    
    player_fields = [
        "team1_player1", "team1_player2",
        "team2_player1", "team2_player2"
    ]
    
    valid_player_ids = {m.get("player_id") for m in league_members}
    # Build lookup dict for player names by ID (league members have "player_name" not "first_name"/"last_name")
    player_names_by_id = {
        m.get("player_id"): m.get("player_name", "")
        for m in league_members
    }
    
    for match in parsed_matches:
        result_match = match.copy()
        
        for field in player_fields:
            player_data = match.get(field)
            id_field = f"{field}_id"
            
            if isinstance(player_data, dict):
                player_id = player_data.get("id")
                player_name = player_data.get("name", "")
                
                if player_id and player_id in valid_player_ids:
                    result_match[id_field] = player_id
                    result_match[f"{field}_confidence"] = 1.0
                    # Look up actual name from league members
                    matched_name = player_names_by_id.get(player_id, player_name).strip()
                    result_match[f"{field}_matched"] = matched_name
                else:
                    match_result = match_player_name(player_name, league_members)
                    if match_result:
                        result_match[id_field] = match_result["player_id"]
                        result_match[f"{field}_confidence"] = match_result["confidence"]
                        result_match[f"{field}_matched"] = match_result["matched_name"]
                    else:
                        result_match[id_field] = None
                        result_match[f"{field}_confidence"] = 0
                        if player_name and player_name not in unmatched_names:
                            unmatched_names.append(player_name)
            else:
                extracted_name = str(player_data) if player_data else ""
                match_result = match_player_name(extracted_name, league_members)
                
                if match_result:
                    result_match[id_field] = match_result["player_id"]
                    result_match[f"{field}_confidence"] = match_result["confidence"]
                    result_match[f"{field}_matched"] = match_result["matched_name"]
                else:
                    result_match[id_field] = None
                    result_match[f"{field}_confidence"] = 0
                    if extracted_name and extracted_name not in unmatched_names:
                        unmatched_names.append(extracted_name)
        
        result_matches.append(result_match)
    
    return result_matches, unmatched_names


# ============================================================================
# OpenAI Integration
# ============================================================================

def _format_member(m: Dict) -> str:
    """Format a league member for inclusion in prompts (compact format)."""
    name = m.get('player_name', 'Unknown')
    nickname = m.get('nickname') or m.get('player_nickname')
    player_id = m.get('player_id', 'N/A')
    # Compact format: "id:name:nickname" or "id:name" if no nickname
    if nickname:
        return f"{player_id}:{name}:{nickname}"
    return f"{player_id}:{name}"


def build_system_prompt(league_members: List[Dict]) -> str:
    """
    Build the system prompt for OpenAI with league member list.
    
    Args:
        league_members: List of league member dictionaries
        
    Returns:
        System prompt string
    """
    # Compact member list format: "id:name:nickname" per line
    member_list = "\n".join([_format_member(m) for m in league_members])
    
    return f"""Extract 2v2 beach volleyball scores from images. Players (id:name:nickname):
{member_list}

Return compact JSON:
{{"st":"success|needs_clarification|unreadable","m":[{{"n":1,"t1":[id1,id2],"t2":[id3,id4],"s":[21,19]}}],"q":"question if needed","err":"error if unreadable"}}

Field key:
- st: status
- m: matches arr
- n: match #
- t1/t2: team1/team2 player IDs (use ID number if matched, "name" string if unmatched). Make sure no player is repeated in the same game.
- s: scores [team1_score, team2_score] - use null for unclear scores
- q: clarification questions (null if none)
- err: error message (null if none)

Example with 2 matches:
{{"st":"success","m":[{{"n":1,"t1":[5,12],"t2":[3,8],"s":[21,19]}},{{"n":2,"t1":[5,3],"t2":[12,8],"s":[21,15]}}],"q":null,"err":null}}

Example with unclear score:
{{"st":"needs_clarification","m":[{{"n":1,"t1":[5,12],"t2":[3,8],"s":[21,null]}}],"q":"What is team 2's score in match 1?","err":null}}

Rules:
- Match names to player list using full name, first name, or nickname
- Use player ID (number) when matched, "name" (string) when unmatched
- Use null (not ?) for any unclear/unreadable scores, then set st="needs_clarification" and ask in q
- If entire image unreadable, set st="unreadable" and explain in err
- Return ONLY valid JSON, no explanation"""


def build_clarification_prompt(league_members: List[Dict]) -> str:
    """
    Build the system prompt for clarification/refinement requests.
    
    This is a simpler prompt for text-only follow-ups that refine
    previously parsed match data based on user feedback.
    
    Args:
        league_members: List of league member dictionaries
        
    Returns:
        System prompt string for clarification
    """
    # Compact member list format: "id:name:nickname" per line
    member_list = "\n".join([_format_member(m) for m in league_members])
    
    return f"""Update match data based on user's answer. Players (id:name:nickname):
{member_list}

The user is answering your previous question. Apply their answer to the correct match and return ALL matches with the update.

Return compact JSON with ALL matches:
{{"st":"success|needs_clarification","m":[{{"n":1,"t1":[id1,id2],"t2":[id3,id4],"s":[21,19]}},{{"n":2,...}}],"q":null,"err":null}}

Rules:
- Keep ALL matches from previous response, just update the one being corrected
- Apply the user's answer to the match referenced in your question
- Use null for any still-unclear scores
- Return ONLY valid JSON, no extra text"""


async def process_photo_with_ai(
    image_base64: str,
    league_members: List[Dict]
) -> Dict[str, Any]:
    """
    Call OpenAI vision API to extract match data from an image.
    
    This is the initial processing call that sends the image to the vision model.
    For follow-up clarifications, use clarify_scores_chat() instead.
    
    Args:
        image_base64: Base64 encoded JPEG image
        league_members: List of league member dictionaries
        
    Returns:
        Dict with status, matches, clarification_question, error_message, raw_response
    """
    total_start = time.perf_counter()
    
    client = get_openai_client()
    
    prompt_start = time.perf_counter()
    system_prompt = build_system_prompt(league_members)
    logger.info(f"[TIMING] build_system_prompt: {time.perf_counter() - prompt_start:.3f}s")
    
    # Build messages with image
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{image_base64}",
                        "detail": "low"  # Use low detail to reduce tokens
                    }
                },
                {"type": "text", "text": "Extract scores."}
            ]
        }
    ]
    
    try:
        logger.info(f"[TIMING] Starting OpenAI {OPENAI_MODEL} call")
        logger.info(f"Image base64 length: {len(image_base64) if image_base64 else 0}, "
                   f"System prompt length: {len(system_prompt)}")
        
        api_start = time.perf_counter()
        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
        )
        api_duration = time.perf_counter() - api_start
        logger.info(f"[TIMING] OpenAI API call: {api_duration:.2f}s")
        
        choice = response.choices[0]
        assistant_message = choice.message.content
        
        # Log token usage if available
        if hasattr(response, 'usage') and response.usage:
            logger.info(f"[TOKENS] prompt={response.usage.prompt_tokens}, "
                       f"completion={response.usage.completion_tokens}, "
                       f"total={response.usage.total_tokens}")
        
        # Check for refusal (some models use this)
        if hasattr(choice.message, 'refusal') and choice.message.refusal:
            logger.warning(f"OpenAI refused: {choice.message.refusal}")
            assistant_message = None
        
        logger.info(f"OpenAI response ({len(assistant_message) if assistant_message else 0} chars): "
                   f"{assistant_message if assistant_message else 'empty'}")
        
        # Handle empty/None response
        if not assistant_message:
            logger.error("OpenAI returned empty content")
            return {
                "status": "failed",
                "matches": [],
                "clarification_question": None,
                "error_message": "OpenAI returned an empty response. The image may not be readable.",
                "raw_response": None
            }
        
        # Parse JSON response
        parse_start = time.perf_counter()
        try:
            parsed = parse_openai_response(assistant_message)
            
            # Expand compact format to verbose format if needed
            if is_compact_format(parsed):
                result = expand_compact_response(parsed)
                logger.info(f"[TIMING] Expanded compact format with {len(result.get('matches', []))} matches")
            else:
                result = parsed
                
            logger.info(f"[TIMING] JSON parse + expand: {time.perf_counter() - parse_start:.3f}s")
            logger.info(f"Parsed result status: {result.get('status')}")
        except Exception as e:
            logger.warning(f"Failed to parse OpenAI response as JSON: {e}")
            logger.warning(f"Raw response was: {assistant_message}")
            result = {
                "status": "needs_clarification",
                "matches": [],
                "clarification_question": f"I had trouble understanding my response. Original: {assistant_message if assistant_message else 'empty'}",
                "error_message": None
            }
        
        result["raw_response"] = assistant_message
        
        logger.info(f"[TIMING] process_photo_with_ai total: {time.perf_counter() - total_start:.2f}s")
        return result
        
    except Exception as e:
        logger.error(f"OpenAI API error: {e}")
        logger.info(f"[TIMING] process_photo_with_ai failed after: {time.perf_counter() - total_start:.2f}s")
        return {
            "status": "failed",
            "matches": [],
            "clarification_question": None,
            "error_message": f"OpenAI API error: {str(e)}",
            "raw_response": None
        }


async def clarify_scores_chat(
    previous_response: str,
    user_prompt: str,
    league_members: List[Dict]
) -> Dict[str, Any]:
    """
    Call OpenAI with text-only clarification request (no image).
    
    This is a cheaper/faster follow-up call that refines previous results
    based on user feedback without re-sending the image.
    
    Args:
        previous_response: The raw JSON response from the initial image processing
        user_prompt: User's clarification/correction text
        league_members: List of league member dictionaries
        
    Returns:
        Dict with status, matches, clarification_question, error_message, raw_response
    """
    total_start = time.perf_counter()
    
    client = get_openai_client()
    system_prompt = build_clarification_prompt(league_members)
    
    # Extract the clarification question from previous response to make context explicit
    clarification_context = ""
    try:
        prev_parsed = json.loads(previous_response)
        prev_question = prev_parsed.get("q") or prev_parsed.get("clarification_question")
        if prev_question:
            clarification_context = f"You asked: \"{prev_question}\"\nUser's answer: "
    except (json.JSONDecodeError, TypeError):
        pass
    
    # Build user message with explicit context
    user_message = f"{clarification_context}{user_prompt}" if clarification_context else user_prompt
    
    # Build simple text-only messages
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "assistant", "content": previous_response},
        {"role": "user", "content": user_message}
    ]
    
    try:
        logger.info(f"[TIMING] Starting OpenAI {OPENAI_CLARIFY_MODEL} clarification call")
        logger.info(f"User prompt: {user_message}")
        logger.info(f"Previous response length: {len(previous_response)}, System prompt length: {len(system_prompt)}")
        
        api_start = time.perf_counter()
        response = await client.chat.completions.create(
            model=OPENAI_CLARIFY_MODEL,
            messages=messages,
        )
        api_duration = time.perf_counter() - api_start
        logger.info(f"[TIMING] OpenAI clarification API call: {api_duration:.2f}s")
        
        choice = response.choices[0]
        assistant_message = choice.message.content
        
        # Log token usage if available
        if hasattr(response, 'usage') and response.usage:
            logger.info(f"[TOKENS] prompt={response.usage.prompt_tokens}, "
                       f"completion={response.usage.completion_tokens}, "
                       f"total={response.usage.total_tokens}")
        
        # Check for refusal
        if hasattr(choice.message, 'refusal') and choice.message.refusal:
            logger.warning(f"OpenAI refused: {choice.message.refusal}")
            assistant_message = None
        
        logger.info(f"OpenAI clarification response ({len(assistant_message) if assistant_message else 0} chars): "
                   f"{assistant_message if assistant_message else 'empty'}")
        
        # Handle empty/None response
        if not assistant_message:
            logger.error("OpenAI returned empty content for clarification")
            return {
                "status": "failed",
                "matches": [],
                "clarification_question": None,
                "error_message": "OpenAI returned an empty response for clarification.",
                "raw_response": None
            }
        
        # Parse JSON response
        parse_start = time.perf_counter()
        try:
            parsed = parse_openai_response(assistant_message)
            
            # Expand compact format to verbose format if needed
            if is_compact_format(parsed):
                result = expand_compact_response(parsed)
                logger.info(f"[TIMING] Expanded compact format with {len(result.get('matches', []))} matches")
            else:
                result = parsed
                
            logger.info(f"[TIMING] JSON parse + expand: {time.perf_counter() - parse_start:.3f}s")
            logger.info(f"Parsed clarification result status: {result.get('status')}")
        except Exception as e:
            logger.warning(f"Failed to parse clarification response as JSON: {e}")
            logger.warning(f"Raw response was: {assistant_message}")
            result = {
                "status": "needs_clarification",
                "matches": [],
                "clarification_question": f"I had trouble processing your correction. Please try again with more detail.",
                "error_message": None
            }
        
        result["raw_response"] = assistant_message
        
        logger.info(f"[TIMING] clarify_scores_chat total: {time.perf_counter() - total_start:.2f}s")
        return result
        
    except Exception as e:
        logger.error(f"OpenAI API error during clarification: {e}")
        logger.info(f"[TIMING] clarify_scores_chat failed after: {time.perf_counter() - total_start:.2f}s")
        return {
            "status": "failed",
            "matches": [],
            "clarification_question": None,
            "error_message": f"OpenAI API error: {str(e)}",
            "raw_response": None
        }


def repair_json(text: str) -> str:
    """
    Attempt to repair common JSON errors from LLM output.
    
    Common errors:
    - }}, instead of },  (extra closing brace in arrays)
    - Missing closing brackets
    """
    # Fix }}, -> }, (common error where model outputs extra } in arrays)
    repaired = re.sub(r'\}\},', '},', text)
    # Fix }}" -> }," 
    repaired = re.sub(r'\}\}"', '},"', repaired)
    return repaired


def parse_openai_response(response_text: str) -> Dict[str, Any]:
    """
    Parse OpenAI response text to extract JSON.
    
    Args:
        response_text: Raw response from OpenAI
        
    Returns:
        Parsed dictionary
    """
    if not response_text:
        raise ValueError("Empty response from OpenAI")
    
    # Strip whitespace
    response_text = response_text.strip()
    
    # Try direct JSON parse
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        pass
    
    # Try with JSON repair (fix common LLM errors)
    try:
        repaired = repair_json(response_text)
        if repaired != response_text:
            return json.loads(repaired)
    except json.JSONDecodeError:
        pass
    
    # Try to find JSON in markdown code blocks (```json ... ``` or ``` ... ```)
    json_match = re.search(r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```', response_text)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except json.JSONDecodeError:
            pass
    
    # Try to find a JSON object starting with { and ending with }
    # Use a more greedy approach to find the outermost braces
    brace_start = response_text.find('{')
    if brace_start != -1:
        # Find matching closing brace
        depth = 0
        for i, char in enumerate(response_text[brace_start:], start=brace_start):
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
                if depth == 0:
                    json_str = response_text[brace_start:i+1]
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        break
    
    # Last resort: try regex for JSON object
    json_match = re.search(r'\{[\s\S]*\}', response_text)
    if json_match:
        try:
            return json.loads(json_match.group(0))
        except json.JSONDecodeError:
            pass
    
    raise ValueError(f"Could not parse JSON from response")


# ============================================================================
# Job Management
# ============================================================================

async def create_photo_match_job(
    db_session: AsyncSession,
    league_id: int,
    session_id: str
) -> int:
    """
    Create a new PhotoMatchJob in the database.
    
    Args:
        db_session: Database session
        league_id: League ID
        session_id: Redis session ID
        
    Returns:
        Job ID
    """
    job = PhotoMatchJob(
        league_id=league_id,
        session_id=session_id,
        status=PhotoMatchJobStatus.PENDING
    )
    db_session.add(job)
    await db_session.flush()
    await db_session.commit()
    await db_session.refresh(job)
    
    logger.info(f"Created PhotoMatchJob {job.id} for session {session_id}")
    return job.id


async def get_photo_match_job(
    db_session: AsyncSession,
    job_id: int
) -> Optional[PhotoMatchJob]:
    """
    Get a PhotoMatchJob by ID.
    
    Args:
        db_session: Database session
        job_id: Job ID
        
    Returns:
        PhotoMatchJob or None
    """
    result = await db_session.execute(
        select(PhotoMatchJob).where(PhotoMatchJob.id == job_id)
    )
    return result.scalar_one_or_none()


async def update_job_status(
    db_session: AsyncSession,
    job_id: int,
    status: PhotoMatchJobStatus,
    result_data: Optional[str] = None,
    error_message: Optional[str] = None
) -> None:
    """
    Update job status and optional result/error.
    
    Args:
        db_session: Database session
        job_id: Job ID
        status: New status
        result_data: JSON result data
        error_message: Error message if failed
    """
    updates = {"status": status}
    
    if status == PhotoMatchJobStatus.RUNNING:
        updates["started_at"] = utcnow()
    elif status in [PhotoMatchJobStatus.COMPLETED, PhotoMatchJobStatus.FAILED]:
        updates["completed_at"] = utcnow()
    
    if result_data is not None:
        updates["result_data"] = result_data
    if error_message is not None:
        updates["error_message"] = error_message
    
    await db_session.execute(
        update(PhotoMatchJob)
        .where(PhotoMatchJob.id == job_id)
        .values(**updates)
    )
    await db_session.commit()
    
    logger.info(f"Updated job {job_id} status to {status.value}")


async def check_idempotency(session_id: str) -> Optional[List[int]]:
    """
    Check if matches have already been created for this session.
    
    Args:
        session_id: Redis session ID
        
    Returns:
        List of match IDs if already created, None otherwise
    """
    session_data = await get_session_data(session_id)
    if session_data and session_data.get("matches_created"):
        return session_data.get("created_match_ids", [])
    return None


# ============================================================================
# Main Processing Functions
# ============================================================================

async def process_photo_job(
    job_id: int,
    league_id: int,
    session_id: str,
    image_base64: str,
    league_members: List[Dict]
) -> None:
    """
    Process a photo match job asynchronously.
    
    This function is designed to be run as a background task for initial
    image processing. For follow-up clarifications, use process_clarification_job().
    
    Args:
        job_id: Job ID
        league_id: League ID
        session_id: Redis session ID
        image_base64: Base64 encoded image
        league_members: List of league members
    """
    job_start = time.perf_counter()
    logger.info(f"[TIMING] Starting process_photo_job {job_id}")
    
    async with db.AsyncSessionLocal() as db_session:
        try:
            # Mark as running
            db_start = time.perf_counter()
            await update_job_status(db_session, job_id, PhotoMatchJobStatus.RUNNING)
            logger.info(f"[TIMING] update_job_status (RUNNING): {time.perf_counter() - db_start:.3f}s")
            
            # Call OpenAI vision model
            result = await process_photo_with_ai(
                image_base64=image_base64,
                league_members=league_members
            )
            
            # Match player names to IDs (do this for any status with matches, not just "success")
            if result.get("matches"):
                match_start = time.perf_counter()
                matches_with_ids, unmatched = match_all_players_in_matches(
                    result["matches"],
                    league_members
                )
                result["matches"] = matches_with_ids
                logger.info(f"[TIMING] match_all_players_in_matches: {time.perf_counter() - match_start:.3f}s")
                
                # If there are unmatched players, change status to needs_clarification
                if unmatched:
                    result["status"] = "needs_clarification"
                    existing_q = result.get("clarification_question", "")
                    unmatched_q = f"I couldn't match these player names: {', '.join(unmatched)}. Please clarify."
                    result["clarification_question"] = f"{existing_q} {unmatched_q}".strip() if existing_q else unmatched_q
            
            # Store result in session (raw_response is used for potential clarifications)
            redis_start = time.perf_counter()
            await update_session_data(session_id, {
                "parsed_matches": result.get("matches", []),
                "status": result.get("status"),
                "clarification_question": result.get("clarification_question"),
                "raw_response": result.get("raw_response"),
                "last_job_id": job_id
            })
            logger.info(f"[TIMING] update_session_data (Redis): {time.perf_counter() - redis_start:.3f}s")
            
            # Update job with result
            result_json = json.dumps({
                "status": result.get("status"),
                "matches": result.get("matches", []),
                "clarification_question": result.get("clarification_question"),
                "error_message": result.get("error_message")
            }, default=str)
            
            db_start = time.perf_counter()
            await update_job_status(
                db_session, job_id, 
                PhotoMatchJobStatus.COMPLETED,
                result_data=result_json
            )
            logger.info(f"[TIMING] update_job_status (COMPLETED): {time.perf_counter() - db_start:.3f}s")
            
            logger.info(f"[TIMING] process_photo_job {job_id} total: {time.perf_counter() - job_start:.2f}s")
            
        except Exception as e:
            logger.error(f"Error processing photo job {job_id}: {e}", exc_info=True)
            logger.info(f"[TIMING] process_photo_job {job_id} failed after: {time.perf_counter() - job_start:.2f}s")
            await update_job_status(
                db_session, job_id,
                PhotoMatchJobStatus.FAILED,
                error_message=str(e)
            )


async def process_clarification_job(
    job_id: int,
    league_id: int,
    session_id: str,
    league_members: List[Dict],
    user_prompt: str
) -> None:
    """
    Process a clarification/edit request asynchronously.
    
    This function handles follow-up requests where users provide corrections
    or clarifications to previously parsed match data. It uses a cheaper
    text-only model instead of re-processing the image.
    
    Args:
        job_id: Job ID
        league_id: League ID
        session_id: Redis session ID
        league_members: List of league members
        user_prompt: User's clarification/correction text
    """
    job_start = time.perf_counter()
    logger.info(f"[TIMING] Starting process_clarification_job {job_id}")
    
    async with db.AsyncSessionLocal() as db_session:
        try:
            # Mark as running
            db_start = time.perf_counter()
            await update_job_status(db_session, job_id, PhotoMatchJobStatus.RUNNING)
            logger.info(f"[TIMING] update_job_status (RUNNING): {time.perf_counter() - db_start:.3f}s")
            
            # Get existing session data with the raw_response
            redis_start = time.perf_counter()
            session_data = await get_session_data(session_id)
            logger.info(f"[TIMING] get_session_data (Redis): {time.perf_counter() - redis_start:.3f}s")
            
            if not session_data:
                raise ValueError(f"Session {session_id} not found or expired")
            
            previous_response = session_data.get("raw_response")
            if not previous_response:
                raise ValueError("No previous response found in session for clarification")
            
            # Call AI to process the clarification
            result = await clarify_scores_chat(
                previous_response=previous_response,
                user_prompt=user_prompt,
                league_members=league_members
            )
            
            # Match player names to IDs (do this for any status with matches, not just "success")
            if result.get("matches"):
                match_start = time.perf_counter()
                matches_with_ids, unmatched = match_all_players_in_matches(
                    result["matches"],
                    league_members
                )
                result["matches"] = matches_with_ids
                logger.info(f"[TIMING] match_all_players_in_matches: {time.perf_counter() - match_start:.3f}s")
                
                # If there are unmatched players, change status to needs_clarification
                if unmatched:
                    result["status"] = "needs_clarification"
                    existing_q = result.get("clarification_question", "")
                    unmatched_q = f"I couldn't match these player names: {', '.join(unmatched)}. Please clarify."
                    result["clarification_question"] = f"{existing_q} {unmatched_q}".strip() if existing_q else unmatched_q
            
            # Store result in session (update raw_response for potential further clarifications)
            redis_start = time.perf_counter()
            await update_session_data(session_id, {
                "parsed_matches": result.get("matches", []),
                "status": result.get("status"),
                "clarification_question": result.get("clarification_question"),
                "raw_response": result.get("raw_response"),
                "last_job_id": job_id
            })
            logger.info(f"[TIMING] update_session_data (Redis): {time.perf_counter() - redis_start:.3f}s")
            
            # Update job with result
            result_json = json.dumps({
                "status": result.get("status"),
                "matches": result.get("matches", []),
                "clarification_question": result.get("clarification_question"),
                "error_message": result.get("error_message")
            }, default=str)
            
            db_start = time.perf_counter()
            await update_job_status(
                db_session, job_id, 
                PhotoMatchJobStatus.COMPLETED,
                result_data=result_json
            )
            logger.info(f"[TIMING] update_job_status (COMPLETED): {time.perf_counter() - db_start:.3f}s")
            
            logger.info(f"[TIMING] process_clarification_job {job_id} total: {time.perf_counter() - job_start:.2f}s")
            
        except Exception as e:
            logger.error(f"Error processing clarification job {job_id}: {e}", exc_info=True)
            logger.info(f"[TIMING] process_clarification_job {job_id} failed after: {time.perf_counter() - job_start:.2f}s")
            await update_job_status(
                db_session, job_id,
                PhotoMatchJobStatus.FAILED,
                error_message=str(e)
            )


async def create_matches_from_session(
    db_session: AsyncSession,
    session_id: str,
    season_id: int,
    match_date: str,
    created_by_player_id: Optional[int] = None
) -> Tuple[bool, List[int], str]:
    """
    Create matches from a confirmed photo session.
    
    Args:
        db_session: Database session
        session_id: Redis session ID
        season_id: Season to create matches in
        match_date: Date for the matches
        created_by_player_id: Player ID of creator
        
    Returns:
        Tuple of (success, match_ids, message)
    """
    # Check idempotency
    existing_ids = await check_idempotency(session_id)
    if existing_ids:
        return True, existing_ids, "Matches already created"
    
    # Get session data
    session_data = await get_session_data(session_id)
    if not session_data:
        return False, [], "Session not found or expired"
    
    parsed_matches = session_data.get("parsed_matches", [])
    if not parsed_matches:
        return False, [], "No matches to create"
    
    # Validate all players have IDs
    for i, match in enumerate(parsed_matches):
        for field in ["team1_player1_id", "team1_player2_id", "team2_player1_id", "team2_player2_id"]:
            if not match.get(field):
                return False, [], f"Match {i+1} has unresolved player: {field.replace('_id', '')}"
    
    # Create matches
    created_ids = []
    try:
        for match in parsed_matches:
            from backend.models.schemas import CreateMatchRequest
            
            match_request = CreateMatchRequest(
                season_id=season_id,
                team1_player1_id=match["team1_player1_id"],
                team1_player2_id=match["team1_player2_id"],
                team2_player1_id=match["team2_player1_id"],
                team2_player2_id=match["team2_player2_id"],
                team1_score=match["team1_score"],
                team2_score=match["team2_score"]
            )
            
            # Get or create session for the season
            session_obj = await data_service.get_or_create_active_league_session(
                db_session,
                league_id=session_data.get("league_id"),
                date=match_date,
                season_id=season_id
            )
            
            match_id = await data_service.create_match_async(
                db_session,
                match_request,
                session_obj["id"],
                match_date
            )
            created_ids.append(match_id)
        
        # Mark session as completed
        await update_session_data(session_id, {
            "matches_created": True,
            "created_match_ids": created_ids
        })
        
        logger.info(f"Created {len(created_ids)} matches from session {session_id}")
        return True, created_ids, f"Created {len(created_ids)} matches"
        
    except Exception as e:
        logger.error(f"Error creating matches: {e}", exc_info=True)
        return False, created_ids, f"Error creating matches: {str(e)}"
