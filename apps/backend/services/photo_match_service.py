"""
Photo Match Service for processing uploaded images of game scores.

This service handles:
- Image preprocessing (JPEG conversion, downscaling)
- Google Gemini vision API integration (structured output, streaming)
- Player name fuzzy matching against league members
- Redis session management for conversation state
- Match creation from parsed data
"""

import asyncio
import base64
import json
import logging
import os
import queue
import re
import time
import uuid
from difflib import SequenceMatcher
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple, Union

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_CLARIFY_MODEL = "gemini-3-flash-preview"
MAX_IMAGE_HEIGHT = 512
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
SESSION_TTL_SECONDS = 900  # 15 minutes

# Redis key prefix for photo match sessions
REDIS_KEY_PREFIX = "photo_match_session:"

# Stream consumer queue message types (producer puts, consumer reads)
STREAM_MSG_PARTIAL = "partial"
STREAM_MSG_DONE = "done"
STREAM_MSG_ERROR = "error"

# Gemini client (singleton); type is Any to allow lazy import
_gemini_client: Any = None


def get_gemini_client():
    """Get or create Gemini client. Lazy-imports google.genai to avoid import-time dependency."""
    global _gemini_client
    if _gemini_client is None:
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set")
        from google import genai
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


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
# Gemini Integration: Prompt, Schema, Normalizer
# ============================================================================

# JSON schema for extraction output: flat array of { t1, t2, s }
EXTRACTION_JSON_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "t1": {
                "type": "array",
                "items": {"oneOf": [{"type": "integer"}, {"type": "string"}]},
                "minItems": 2,
                "maxItems": 2,
                "description": "Team 1 players: integer ID from Master List or raw name string",
            },
            "t2": {
                "type": "array",
                "items": {"oneOf": [{"type": "integer"}, {"type": "string"}]},
                "minItems": 2,
                "maxItems": 2,
                "description": "Team 2 players: integer ID from Master List or raw name string",
            },
            "s": {
                "type": "string",
                "description": "Score as T1_Score-T2_Score, e.g. 21-15",
            },
        },
        "required": ["t1", "t2", "s"],
    },
}


def _format_master_list_entry(m: Dict) -> str:
    """Format a league member for Master Player List: 'id: Name (Nickname)' or 'id: Name'."""
    name = (m.get("player_name") or "Unknown").strip()
    nickname = m.get("nickname") or m.get("player_nickname")
    player_id = m.get("player_id", "N/A")
    if nickname and str(nickname).strip():
        return f"{player_id}: {name} ({str(nickname).strip()})"
    return f"{player_id}: {name}"


def build_scoreboard_prompt(league_members: List[Dict]) -> str:
    """
    Build the Scoreboard Data Extractor prompt with dynamic Master Player List.

    Args:
        league_members: List of league member dictionaries

    Returns:
        Full prompt string for Gemini.
    """
    master_list = "\n".join(_format_master_list_entry(m) for m in league_members)
    return f"""Role: Scoreboard Data Extractor
Task: Convert a 2v2 Beach Volleyball scoresheet image into a JSON array conforming to the schema (t1, t2, s).

Master Player List:
(Match handwriting to these IDs. Use nicknames/fuzzy matching.)
{master_list}

Instructions:
1. Extract every match (Team 1 vs Team 2) and the final score.
2. For each player: if found in Master List output ONLY the integer ID; if NOT found output the raw text string.
3. Score "s" must be "T1_Score-T2_Score" (left = Team 1, right = Team 2).

Example: [{{ "t1": [1, "Unknown Guy"], "t2": [4, 5], "s": "21-15" }}]

Generate the JSON array now."""


def build_clarification_prompt_for_array(league_members: List[Dict]) -> str:
    """
    Build the system prompt for clarification requests that return the same array format.

    Args:
        league_members: List of league member dictionaries

    Returns:
        System prompt string for clarification (array output).
    """
    master_list = "\n".join(_format_master_list_entry(m) for m in league_members)
    return f"""Update match data based on the user's answer. Return the same JSON array format.

Master Player List:
{master_list}

Output: A flat JSON array of objects with keys "t1", "t2", "s". Same format as before.
- t1/t2: arrays of 2 elements each (integer ID or string name).
- s: "T1_Score-T2_Score" (e.g. "21-15").
Apply the user's correction to the relevant match and return ALL matches. Return ONLY valid JSON array, no extra text."""


def _to_player_dict(val: Union[int, str, None]) -> Dict:
    """Convert t1/t2 element to verbose player shape {id, name}."""
    if val is None:
        return {"id": None, "name": ""}
    if isinstance(val, int):
        return {"id": val, "name": ""}
    return {"id": None, "name": str(val).strip()}


def _parse_score_string(s: str) -> Tuple[Optional[int], Optional[int]]:
    """Parse 'T1_Score-T2_Score' into (team1_score, team2_score)."""
    if not s or not isinstance(s, str):
        return None, None
    parts = s.strip().split("-")
    if len(parts) != 2:
        return None, None
    try:
        t1 = int(parts[0].strip())
        t2 = int(parts[1].strip())
        return t1, t2
    except (ValueError, TypeError):
        return None, None


def normalize_extraction_response(raw_array: List[Dict]) -> Dict[str, Any]:
    """
    Convert Gemini extraction array [{t1, t2, s}, ...] to verbose format for downstream.

    Args:
        raw_array: List of objects with t1, t2, s (s is "T1_Score-T2_Score" string).

    Returns:
        Dict with status, matches (verbose), clarification_question, error_message.
    """
    matches = []
    for i, m in enumerate(raw_array or []):
        t1 = m.get("t1") or [None, None]
        t2 = m.get("t2") or [None, None]
        s = m.get("s")
        team1_score, team2_score = _parse_score_string(s) if s else (None, None)
        match = {
            "match_number": i + 1,
            "team1_player1": _to_player_dict(t1[0] if len(t1) > 0 else None),
            "team1_player2": _to_player_dict(t1[1] if len(t1) > 1 else None),
            "team2_player1": _to_player_dict(t2[0] if len(t2) > 0 else None),
            "team2_player2": _to_player_dict(t2[1] if len(t2) > 1 else None),
            "team1_score": team1_score,
            "team2_score": team2_score,
        }
        matches.append(match)
    return {
        "status": "success",
        "matches": matches,
        "clarification_question": None,
        "error_message": None,
    }


def _extract_complete_match_objects_from_buffer(buffer: str) -> Tuple[List[Dict], int]:
    """
    Parse buffer for complete match objects {t1, t2, s}; return list and count of chars consumed.

    Used during streaming to update partial_matches. Tries to parse from the start
    of the buffer (after optional leading '[') and returns all complete objects.
    """
    consumed = 0
    result: List[Dict] = []
    text = buffer.strip()
    if not text:
        return result, 0
    start = 0
    if text.startswith("["):
        start = 1
    pos = start
    n = len(text)
    while pos < n:
        while pos < n and text[pos] in " \t\n\r,":
            pos += 1
        if pos >= n:
            break
        if text[pos] == "]":
            consumed = pos + 1
            break
        if text[pos] != "{":
            break
        depth = 0
        i = pos
        while i < n:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        obj = json.loads(text[pos : i + 1])
                        if isinstance(obj, dict) and "t1" in obj and "t2" in obj and "s" in obj:
                            result.append(obj)
                            consumed = i + 1
                    except json.JSONDecodeError:
                        pass
                    break
            i += 1
        pos = i + 1
    return result, consumed


def _normalize_single_match(raw: Dict) -> Dict:
    """Convert one raw extraction object {t1, t2, s} to one verbose match for partial_matches."""
    t1 = raw.get("t1") or [None, None]
    t2 = raw.get("t2") or [None, None]
    s = raw.get("s")
    team1_score, team2_score = _parse_score_string(s) if s else (None, None)
    return {
        "match_number": 0,  # filled by index when building list
        "team1_player1": _to_player_dict(t1[0] if len(t1) > 0 else None),
        "team1_player2": _to_player_dict(t1[1] if len(t1) > 1 else None),
        "team2_player1": _to_player_dict(t2[0] if len(t2) > 0 else None),
        "team2_player2": _to_player_dict(t2[1] if len(t2) > 1 else None),
        "team1_score": team1_score,
        "team2_score": team2_score,
    }


def _text_from_chunk(chunk: Any) -> Optional[str]:
    """
    Extract text from a Gemini stream chunk.

    Tries chunk.text (SDK convenience) then candidates[0].content.parts[0].text.
    Returns None if no text is present.
    """
    if not chunk:
        return None
    if getattr(chunk, "text", None):
        return chunk.text
    if not (chunk.candidates and chunk.candidates[0].content and chunk.candidates[0].content.parts):
        return None
    part = chunk.candidates[0].content.parts[0]
    return getattr(part, "text", None) or None


def _run_gemini_stream_consumer(
    out_queue: queue.Queue,
    image_bytes: bytes,
    prompt: str,
) -> None:
    """
    Run Gemini generate_content_stream (sync). Puts (STREAM_MSG_PARTIAL, list) and
    (STREAM_MSG_DONE, full_raw_text) on the queue. Called from asyncio.to_thread; queue is thread-safe.
    """
    client = get_gemini_client()
    from google.genai import types

    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
        prompt,
    ]
    config = {
        "response_mime_type": "application/json",
        "response_json_schema": EXTRACTION_JSON_SCHEMA,
        "thinking_config": types.ThinkingConfig(thinking_level="low"),
    }
    full_raw = ""
    buffer = ""
    all_partial: List[Dict] = []

    try:
        stream = client.models.generate_content_stream(
            model=GEMINI_MODEL,
            contents=contents,
            config=config,
        )
        chunk_count = 0
        for chunk in stream:
            chunk_count += 1
            text_piece = _text_from_chunk(chunk)
            if not text_piece:
                continue
            full_raw += text_piece
            buffer += text_piece
            objs, consumed = _extract_complete_match_objects_from_buffer(buffer)
            buffer = buffer[consumed:]
            for o in objs:
                m = _normalize_single_match(o)
                m["match_number"] = len(all_partial) + 1
                all_partial.append(m)
            if objs:
                out_queue.put((STREAM_MSG_PARTIAL, list(all_partial)))
        out_queue.put((STREAM_MSG_DONE, full_raw))
    except Exception as e:
        logger.exception("Gemini stream consumer error: %s", e)
        # Send a clear message only; avoid leaking stack traces to the queue
        msg = str(e) if e else "Unknown error"
        if len(msg) > 500:
            msg = msg[:497] + "..."
        out_queue.put((STREAM_MSG_ERROR, msg))


def _parse_extraction_array(response_text: str) -> List[Dict]:
    """
    Parse response text as a JSON array of extraction objects.

    Accepts a raw string (array or object with 'matches' key). Returns the list of match dicts
    or raises ValueError if empty or unparseable.
    """
    if not response_text or not response_text.strip():
        raise ValueError("Empty response")
    text = response_text.strip()
    # Try direct parse
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return parsed
        if isinstance(parsed, dict) and "matches" in parsed:
            return parsed["matches"]
        raise ValueError("Expected JSON array or object with 'matches'")
    except json.JSONDecodeError:
        pass
    # Try to find JSON array in text
    bracket = text.find("[")
    if bracket != -1:
        depth = 0
        for i, c in enumerate(text[bracket:], start=bracket):
            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[bracket : i + 1])
                    except json.JSONDecodeError:
                        break
    raise ValueError(f"Could not parse JSON array from response: {text[:200]}...")


async def clarify_scores_chat(
    previous_response: str,
    user_prompt: str,
    league_members: List[Dict]
) -> Dict[str, Any]:
    """
    Call Gemini with text-only clarification request (no image).

    Returns the same array format; normalizer converts to verbose for downstream.

    Args:
        previous_response: Raw or normalized JSON from initial processing (array or string)
        user_prompt: User's clarification/correction text
        league_members: List of league member dictionaries

    Returns:
        Dict with status, matches, clarification_question, error_message, raw_response
    """
    client = get_gemini_client()
    system_prompt = build_clarification_prompt_for_array(league_members)
    user_message = f"Previous extraction:\n{previous_response}\n\nUser's correction/answer:\n{user_prompt}"

    def _call() -> str:
        from google.genai import types

        response = client.models.generate_content(
            model=GEMINI_CLARIFY_MODEL,
            contents=user_message,
            config={
                "response_mime_type": "application/json",
                "response_json_schema": EXTRACTION_JSON_SCHEMA,
                "system_instruction": system_prompt,
                "thinking_config": types.ThinkingConfig(thinking_level="low"),
            },
        )
        if response and response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            return (response.candidates[0].content.parts[0].text or "") or ""
        return ""

    try:
        raw_text = await asyncio.to_thread(_call)
        if not raw_text:
            return {
                "status": "failed",
                "matches": [],
                "clarification_question": None,
                "error_message": "Gemini returned an empty response for clarification.",
                "raw_response": None,
            }
        arr = _parse_extraction_array(raw_text)
        result = normalize_extraction_response(arr)
        result["raw_response"] = raw_text
        return result
    except Exception as e:
        logger.error(f"Gemini API error during clarification: {e}")
        return {
            "status": "failed",
            "matches": [],
            "clarification_question": None,
            "error_message": f"Gemini API error: {str(e)}",
            "raw_response": None,
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
# SSE event stream for photo job (consumed by GET .../photo-jobs/{id}/stream)
# ============================================================================

# Default poll interval and timeout for SSE stream
SSE_POLL_INTERVAL_SEC = 0.4
SSE_TIMEOUT_SEC = 180


async def stream_photo_job_events(
    job_id: int,
    league_id: int,
    session_id: str,
    poll_interval_sec: float = SSE_POLL_INTERVAL_SEC,
    timeout_sec: float = SSE_TIMEOUT_SEC,
):
    """
    Async generator that yields (event_name, data_dict) for SSE.

    Polls Redis (partial_matches) and DB (job status) at poll_interval_sec.
    Yields ("partial", {"partial_matches": [...]}) when partial_matches change,
    ("done", {"status", "result"}) when job completes or fails,
    ("error", {"message": "..."}) on timeout or exception.

    Intended for one client per job; callers should format each (event, data)
    as SSE (e.g. event: name\\ndata: json\\n\\n) and stream to the client.

    Args:
        job_id: Photo match job ID
        league_id: League ID (caller must have already verified job belongs to league)
        session_id: Redis session ID from the job
        poll_interval_sec: Seconds between Redis/DB polls
        timeout_sec: Max stream duration; yields error event and exits if exceeded

    Yields:
        Tuples (event_name: str, data: dict)
    """
    start = time.perf_counter()
    last_partial: Optional[List[Dict]] = None

    while True:
        elapsed = time.perf_counter() - start
        if elapsed >= timeout_sec:
            yield ("error", {"message": "Stream timed out"})
            return

        try:
            async with db.AsyncSessionLocal() as db_session:
                job = await get_photo_match_job(db_session, job_id)
            if not job:
                yield ("error", {"message": "Job not found"})
                return
            if job.league_id != league_id:
                yield ("error", {"message": "Job does not belong to this league"})
                return

            status = job.status
            if status == PhotoMatchJobStatus.COMPLETED:
                result = None
                if job.result_data:
                    try:
                        result = json.loads(job.result_data)
                    except (json.JSONDecodeError, TypeError):
                        result = {"status": "COMPLETED", "error_message": "Invalid result data"}
                yield ("done", {"status": "COMPLETED", "result": result})
                return
            if status == PhotoMatchJobStatus.FAILED:
                yield (
                    "done",
                    {
                        "status": "FAILED",
                        "result": {"status": "FAILED", "error_message": job.error_message or "Processing failed"},
                    },
                )
                return

            session_data = await get_session_data(session_id)
            partial_matches = (session_data or {}).get("partial_matches") if session_data else None
            if partial_matches is not None and partial_matches != last_partial:
                last_partial = partial_matches
                yield ("partial", {"partial_matches": partial_matches})

        except Exception as e:
            logger.exception("Error in stream_photo_job_events: %s", e)
            yield ("error", {"message": "Stream error"})
            return

        await asyncio.sleep(poll_interval_sec)


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
    Process a photo match job asynchronously with Gemini streaming.

    Streams extraction from Gemini, updates Redis partial_matches as complete
    match objects arrive, then normalizes, matches players, and stores final result.

    Args:
        job_id: Job ID
        league_id: League ID
        session_id: Redis session ID
        image_base64: Base64 encoded image
        league_members: List of league members
    """
    async with db.AsyncSessionLocal() as db_session:
        try:
            await update_job_status(db_session, job_id, PhotoMatchJobStatus.RUNNING)
            image_bytes = base64.b64decode(image_base64)
            prompt = build_scoreboard_prompt(league_members)
            out_queue: queue.Queue = queue.Queue()
            stream_task = asyncio.create_task(
                asyncio.to_thread(_run_gemini_stream_consumer, out_queue, image_bytes, prompt)
            )
            final_buffer: Optional[str] = None

            def get_from_queue():
                return out_queue.get(timeout=0.5)

            while True:
                try:
                    item = await asyncio.get_event_loop().run_in_executor(None, get_from_queue)
                except Exception:
                    if stream_task.done():
                        break
                    await asyncio.sleep(0.2)
                    continue
                msg_type, payload = item[0], item[1]
                if msg_type == STREAM_MSG_ERROR:
                    raise RuntimeError(payload)
                if msg_type == STREAM_MSG_PARTIAL:
                    # Resolve player names against league members before showing in UI,
                    # so the table doesn't flash "Unknown" then fill in names.
                    matches_with_ids, _ = match_all_players_in_matches(payload, league_members)
                    await update_session_data(session_id, {"partial_matches": matches_with_ids})
                elif msg_type == STREAM_MSG_DONE:
                    final_buffer = payload
                    break
            await stream_task

            if final_buffer is None:
                raise ValueError("Stream ended without final buffer")

            arr = _parse_extraction_array(final_buffer)
            result = normalize_extraction_response(arr)
            result["raw_response"] = final_buffer

            if result.get("matches"):
                matches_with_ids, unmatched = match_all_players_in_matches(
                    result["matches"],
                    league_members
                )
                result["matches"] = matches_with_ids
                if unmatched:
                    result["status"] = "needs_clarification"
                    result["clarification_question"] = (
                        f"I couldn't match these player names: {', '.join(unmatched)}. Please clarify."
                    )

            await update_session_data(session_id, {
                "parsed_matches": result.get("matches", []),
                "status": result.get("status"),
                "clarification_question": result.get("clarification_question"),
                "raw_response": result.get("raw_response"),
                "last_job_id": job_id,
                "partial_matches": result.get("matches", []),
            })
            result_json = json.dumps({
                "status": result.get("status"),
                "matches": result.get("matches", []),
                "clarification_question": result.get("clarification_question"),
                "error_message": result.get("error_message"),
            }, default=str)
            await update_job_status(
                db_session, job_id,
                PhotoMatchJobStatus.COMPLETED,
                result_data=result_json
            )

        except Exception as e:
            logger.error(f"Error processing photo job {job_id}: {e}", exc_info=True)
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
    async with db.AsyncSessionLocal() as db_session:
        try:
            # Mark as running
            await update_job_status(db_session, job_id, PhotoMatchJobStatus.RUNNING)

            # Get existing session data with the raw_response
            session_data = await get_session_data(session_id)
            
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
                matches_with_ids, unmatched = match_all_players_in_matches(
                    result["matches"],
                    league_members
                )
                result["matches"] = matches_with_ids

                # If there are unmatched players, change status to needs_clarification
                if unmatched:
                    result["status"] = "needs_clarification"
                    existing_q = result.get("clarification_question", "")
                    unmatched_q = f"I couldn't match these player names: {', '.join(unmatched)}. Please clarify."
                    result["clarification_question"] = f"{existing_q} {unmatched_q}".strip() if existing_q else unmatched_q
            
            # Store result in session (update raw_response for potential further clarifications)
            await update_session_data(session_id, {
                "parsed_matches": result.get("matches", []),
                "status": result.get("status"),
                "clarification_question": result.get("clarification_question"),
                "raw_response": result.get("raw_response"),
                "last_job_id": job_id
            })

            # Update job with result
            result_json = json.dumps({
                "status": result.get("status"),
                "matches": result.get("matches", []),
                "clarification_question": result.get("clarification_question"),
                "error_message": result.get("error_message")
            }, default=str)

            await update_job_status(
                db_session, job_id,
                PhotoMatchJobStatus.COMPLETED,
                result_data=result_json
            )

        except Exception as e:
            logger.error(f"Error processing clarification job {job_id}: {e}", exc_info=True)
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
