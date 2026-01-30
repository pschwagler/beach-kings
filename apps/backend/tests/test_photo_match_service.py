"""
Tests for the photo match service.

Tests image preprocessing, player name matching, and job management.
"""

import base64
import json
import pytest
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch
from PIL import Image

from backend.services import photo_match_service
from backend.database.models import PhotoMatchJob, PhotoMatchJobStatus


# ============================================================================
# Test Data Fixtures
# ============================================================================

@pytest.fixture
def sample_league_members():
    """Sample league members for testing."""
    return [
        {"player_id": 1, "player_name": "John Doe"},
        {"player_id": 2, "player_name": "Jane Smith"},
        {"player_id": 3, "player_name": "Bob Wilson"},
        {"player_id": 4, "player_name": "Alice Brown"},
        {"player_id": 5, "player_name": "Charlie Davis"},
        {"player_id": 6, "player_name": "Emily Johnson"},
    ]


@pytest.fixture
def sample_parsed_matches():
    """Sample parsed matches from OpenAI."""
    return [
        {
            "team1_player1": "John Doe",
            "team1_player2": "Jane Smith",
            "team2_player1": "Bob Wilson",
            "team2_player2": "Alice Brown",
            "team1_score": 21,
            "team2_score": 19
        },
        {
            "team1_player1": "Charlie",  # Partial name
            "team1_player2": "Emily Johnson",
            "team2_player1": "John",  # First name only
            "team2_player2": "Jane",  # First name only
            "team1_score": 21,
            "team2_score": 15
        }
    ]


@pytest.fixture
def sample_image_bytes():
    """Create a sample image for testing."""
    img = Image.new('RGB', (800, 600), color='white')
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    return buffer.getvalue()


@pytest.fixture
def sample_rgba_image_bytes():
    """Create a sample RGBA image for testing."""
    img = Image.new('RGBA', (800, 600), color=(255, 255, 255, 128))
    buffer = BytesIO()
    img.save(buffer, format='PNG')
    return buffer.getvalue()


# ============================================================================
# Image Validation Tests
# ============================================================================

class TestValidateImageFile:
    """Tests for validate_image_file function."""
    
    def test_valid_jpeg_image(self, sample_image_bytes):
        """Test valid JPEG image passes validation."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_image_bytes,
            "image/jpeg",
            "test.jpg"
        )
        assert is_valid is True
        assert error == ""
    
    def test_valid_png_image(self, sample_rgba_image_bytes):
        """Test valid PNG image passes validation."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_rgba_image_bytes,
            "image/png",
            "test.png"
        )
        assert is_valid is True
        assert error == ""
    
    def test_file_too_large(self, sample_image_bytes):
        """Test file size limit is enforced."""
        # Create oversized content
        large_content = b'x' * (11 * 1024 * 1024)  # 11MB
        
        is_valid, error = photo_match_service.validate_image_file(
            large_content,
            "image/jpeg",
            "test.jpg"
        )
        assert is_valid is False
        assert "exceeds maximum" in error.lower()
    
    def test_invalid_extension(self, sample_image_bytes):
        """Test invalid file extension is rejected."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_image_bytes,
            "image/jpeg",
            "test.txt"
        )
        assert is_valid is False
        assert "invalid file type" in error.lower()
    
    def test_corrupted_image(self):
        """Test corrupted image is rejected."""
        corrupted_content = b'not an image at all'
        
        is_valid, error = photo_match_service.validate_image_file(
            corrupted_content,
            "image/jpeg",
            "test.jpg"
        )
        assert is_valid is False
        assert "invalid" in error.lower() or "corrupted" in error.lower()


# ============================================================================
# Image Preprocessing Tests
# ============================================================================

class TestPreprocessImage:
    """Tests for preprocess_image function."""
    
    def test_basic_preprocessing(self, sample_image_bytes):
        """Test basic image preprocessing."""
        processed_bytes, base64_str = photo_match_service.preprocess_image(sample_image_bytes)
        
        # Verify output is valid
        assert len(processed_bytes) > 0
        assert len(base64_str) > 0
        
        # Verify base64 encoding
        decoded = base64.b64decode(base64_str)
        assert decoded == processed_bytes
        
        # Verify output is JPEG
        img = Image.open(BytesIO(processed_bytes))
        assert img.format == 'JPEG'
    
    def test_image_downscaling(self):
        """Test that tall images are downscaled to max 400px height."""
        # Create a tall image (1200px height)
        img = Image.new('RGB', (800, 1200), color='white')
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        tall_image_bytes = buffer.getvalue()
        
        processed_bytes, _ = photo_match_service.preprocess_image(tall_image_bytes)
        
        # Verify height is reduced to MAX_IMAGE_HEIGHT
        result_img = Image.open(BytesIO(processed_bytes))
        max_height = photo_match_service.MAX_IMAGE_HEIGHT
        assert result_img.height <= max_height
        # Verify aspect ratio is maintained (approximately)
        expected_width = int(800 * (max_height / 1200))
        assert abs(result_img.width - expected_width) < 5
    
    def test_rgba_to_rgb_conversion(self, sample_rgba_image_bytes):
        """Test RGBA images are converted to RGB."""
        processed_bytes, _ = photo_match_service.preprocess_image(sample_rgba_image_bytes)
        
        # Verify output is RGB
        img = Image.open(BytesIO(processed_bytes))
        assert img.mode == 'RGB'
    
    def test_small_image_not_upscaled(self):
        """Test that small images are not upscaled."""
        # Create a small image (200px height)
        img = Image.new('RGB', (300, 200), color='white')
        buffer = BytesIO()
        img.save(buffer, format='JPEG')
        small_image_bytes = buffer.getvalue()
        
        processed_bytes, _ = photo_match_service.preprocess_image(small_image_bytes)
        
        # Verify dimensions are unchanged
        result_img = Image.open(BytesIO(processed_bytes))
        assert result_img.height == 200
        assert result_img.width == 300


# ============================================================================
# Player Name Matching Tests
# ============================================================================

class TestCalculateNameSimilarity:
    """Tests for calculate_name_similarity function."""
    
    def test_exact_match(self):
        """Test exact match returns 1.0."""
        score = photo_match_service.calculate_name_similarity("John Doe", "John Doe")
        assert score == 1.0
    
    def test_case_insensitive(self):
        """Test matching is case insensitive."""
        score = photo_match_service.calculate_name_similarity("JOHN DOE", "john doe")
        assert score == 1.0
    
    def test_partial_match(self):
        """Test partial match returns reasonable score."""
        score = photo_match_service.calculate_name_similarity("John", "John Doe")
        assert 0.4 < score < 0.8
    
    def test_no_match(self):
        """Test no match returns low score."""
        score = photo_match_service.calculate_name_similarity("xyz", "John Doe")
        assert score < 0.3


class TestMatchPlayerName:
    """Tests for match_player_name function."""
    
    def test_exact_match(self, sample_league_members):
        """Test exact name match."""
        result = photo_match_service.match_player_name("John Doe", sample_league_members)
        
        assert result is not None
        assert result["player_id"] == 1
        assert result["confidence"] >= 0.9
        assert result["matched_name"] == "John Doe"
    
    def test_first_name_match(self, sample_league_members):
        """Test first name only match."""
        result = photo_match_service.match_player_name("John", sample_league_members)
        
        assert result is not None
        assert result["player_id"] == 1
        assert result["confidence"] >= 0.6
    
    def test_partial_match(self, sample_league_members):
        """Test partial name match."""
        result = photo_match_service.match_player_name("Charlie", sample_league_members)
        
        assert result is not None
        assert result["player_id"] == 5  # Charlie Davis
    
    def test_no_match(self, sample_league_members):
        """Test unmatched name returns None."""
        result = photo_match_service.match_player_name("Unknown Player", sample_league_members)
        
        assert result is None
    
    def test_empty_name(self, sample_league_members):
        """Test empty name returns None."""
        result = photo_match_service.match_player_name("", sample_league_members)
        
        assert result is None
    
    def test_empty_members(self):
        """Test empty member list returns None."""
        result = photo_match_service.match_player_name("John Doe", [])
        
        assert result is None


class TestMatchAllPlayersInMatches:
    """Tests for match_all_players_in_matches function."""
    
    def test_all_players_matched(self, sample_league_members):
        """Test all players are matched when names are exact."""
        matches = [{
            "team1_player1": "John Doe",
            "team1_player2": "Jane Smith",
            "team2_player1": "Bob Wilson",
            "team2_player2": "Alice Brown",
            "team1_score": 21,
            "team2_score": 19
        }]
        
        result_matches, unmatched = photo_match_service.match_all_players_in_matches(
            matches, sample_league_members
        )
        
        assert len(result_matches) == 1
        assert len(unmatched) == 0
        
        match = result_matches[0]
        assert match["team1_player1_id"] == 1
        assert match["team1_player2_id"] == 2
        assert match["team2_player1_id"] == 3
        assert match["team2_player2_id"] == 4
    
    def test_some_players_unmatched(self, sample_league_members):
        """Test unmatched players are collected."""
        matches = [{
            "team1_player1": "John Doe",
            "team1_player2": "Unknown Person",
            "team2_player1": "Bob Wilson",
            "team2_player2": "Mystery Player",
            "team1_score": 21,
            "team2_score": 19
        }]
        
        result_matches, unmatched = photo_match_service.match_all_players_in_matches(
            matches, sample_league_members
        )
        
        assert len(result_matches) == 1
        assert len(unmatched) == 2
        assert "Unknown Person" in unmatched
        assert "Mystery Player" in unmatched
        
        match = result_matches[0]
        assert match["team1_player1_id"] == 1
        assert match["team1_player2_id"] is None
        assert match["team2_player1_id"] == 3
        assert match["team2_player2_id"] is None


# ============================================================================
# Extraction Array Parsing Tests
# ============================================================================

class TestParseExtractionArray:
    """Tests for _parse_extraction_array function."""

    def test_parse_valid_array(self):
        """Test parsing valid JSON array."""
        response = '[{"t1": [1, 2], "t2": [3, 4], "s": "21-15"}]'
        result = photo_match_service._parse_extraction_array(response)
        assert len(result) == 1
        assert result[0]["t1"] == [1, 2]
        assert result[0]["t2"] == [3, 4]
        assert result[0]["s"] == "21-15"

    def test_parse_array_with_whitespace(self):
        """Test parsing array with leading/trailing whitespace."""
        response = '  [{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]  '
        result = photo_match_service._parse_extraction_array(response)
        assert len(result) == 1
        assert result[0]["s"] == "21-19"

    def test_parse_invalid_raises(self):
        """Test invalid text raises ValueError."""
        with pytest.raises(ValueError):
            photo_match_service._parse_extraction_array("not json")


# ============================================================================
# Normalize Extraction Response Tests
# ============================================================================

class TestNormalizeExtractionResponse:
    """Tests for normalize_extraction_response (array -> verbose format)."""

    def test_normalize_single_match(self):
        """Test normalizing one match with int IDs and score string."""
        raw = [{"t1": [1, 2], "t2": [3, 4], "s": "21-15"}]
        result = photo_match_service.normalize_extraction_response(raw)
        assert result["status"] == "success"
        assert len(result["matches"]) == 1
        m = result["matches"][0]
        assert m["match_number"] == 1
        assert m["team1_player1"] == {"id": 1, "name": ""}
        assert m["team1_player2"] == {"id": 2, "name": ""}
        assert m["team2_player1"] == {"id": 3, "name": ""}
        assert m["team2_player2"] == {"id": 4, "name": ""}
        assert m["team1_score"] == 21
        assert m["team2_score"] == 15

    def test_normalize_unmatched_name(self):
        """Test normalizing match with string (unmatched) player."""
        raw = [{"t1": [1, "Unknown Guy"], "t2": [4, 5], "s": "21-15"}]
        result = photo_match_service.normalize_extraction_response(raw)
        assert len(result["matches"]) == 1
        m = result["matches"][0]
        assert m["team1_player1"] == {"id": 1, "name": ""}
        assert m["team1_player2"] == {"id": None, "name": "Unknown Guy"}
        assert m["team1_score"] == 21
        assert m["team2_score"] == 15

    def test_normalize_multiple_matches(self):
        """Test normalizing multiple matches."""
        raw = [
            {"t1": [1, 2], "t2": [3, 4], "s": "21-19"},
            {"t1": [1, 3], "t2": [2, 4], "s": "21-15"},
        ]
        result = photo_match_service.normalize_extraction_response(raw)
        assert len(result["matches"]) == 2
        assert result["matches"][0]["match_number"] == 1
        assert result["matches"][1]["match_number"] == 2
        assert result["matches"][0]["team1_score"] == 21
        assert result["matches"][0]["team2_score"] == 19
        assert result["matches"][1]["team1_score"] == 21
        assert result["matches"][1]["team2_score"] == 15

    def test_normalize_empty_array(self):
        """Test normalizing empty array."""
        result = photo_match_service.normalize_extraction_response([])
        assert result["status"] == "success"
        assert result["matches"] == []


# ============================================================================
# Legacy JSON Parsing (parse_openai_response) - still used for fallback
# ============================================================================

class TestParseOpenAIResponse:
    """Tests for parse_openai_response function (legacy/clarification)."""

    def test_parse_valid_json(self):
        """Test parsing valid JSON response."""
        response = '{"status": "success", "matches": []}'
        result = photo_match_service.parse_openai_response(response)
        assert result["status"] == "success"
        assert result["matches"] == []

    def test_parse_json_in_markdown(self):
        """Test parsing JSON wrapped in markdown code block."""
        response = '''Here are the extracted matches:

```json
{"status": "success", "matches": [{"team1_score": 21}]}
```

I found one match in the image.'''
        result = photo_match_service.parse_openai_response(response)
        assert result["status"] == "success"
        assert len(result["matches"]) == 1

    def test_parse_invalid_json(self):
        """Test parsing invalid JSON raises error."""
        with pytest.raises(ValueError):
            photo_match_service.parse_openai_response("This is not JSON at all")


# ============================================================================
# Scoreboard Prompt Tests
# ============================================================================

class TestBuildScoreboardPrompt:
    """Tests for build_scoreboard_prompt function."""

    def test_includes_master_list(self, sample_league_members):
        """Test prompt includes Master Player List with member names."""
        prompt = photo_match_service.build_scoreboard_prompt(sample_league_members)
        assert "Master Player List" in prompt
        assert "John Doe" in prompt
        assert "Jane Smith" in prompt
        assert "Bob Wilson" in prompt
        assert "Alice Brown" in prompt

    def test_includes_instructions(self, sample_league_members):
        """Test prompt includes task instructions."""
        prompt = photo_match_service.build_scoreboard_prompt(sample_league_members)
        assert "Scoreboard Data Extractor" in prompt
        assert "2v2" in prompt.lower()
        assert "volleyball" in prompt.lower()
        assert "t1" in prompt
        assert "t2" in prompt
        assert "s" in prompt

    def test_includes_nickname_when_present(self):
        """Test prompt includes nickname in Master List entry when present."""
        members = [{"player_id": 1, "player_name": "Patrick Schwagler", "player_nickname": "Pat"}]
        prompt = photo_match_service.build_scoreboard_prompt(members)
        assert "Patrick Schwagler" in prompt
        assert "Pat" in prompt


# ============================================================================
# Session ID Generation Tests
# ============================================================================

class TestGenerateSessionId:
    """Tests for generate_session_id function."""
    
    def test_generates_unique_ids(self):
        """Test that session IDs are unique."""
        ids = set()
        for _ in range(100):
            session_id = photo_match_service.generate_session_id()
            assert session_id not in ids
            ids.add(session_id)
    
    def test_generates_valid_uuid(self):
        """Test that session ID is a valid UUID."""
        import uuid
        session_id = photo_match_service.generate_session_id()
        
        # Should be parseable as UUID
        parsed = uuid.UUID(session_id)
        assert str(parsed) == session_id


# ============================================================================
# Idempotency Tests
# ============================================================================

class TestCheckIdempotency:
    """Tests for check_idempotency function."""
    
    @pytest.mark.asyncio
    async def test_returns_none_when_not_created(self):
        """Test returns None when matches not yet created."""
        with patch.object(photo_match_service, 'get_session_data') as mock_get:
            mock_get.return_value = {
                "matches_created": False,
                "parsed_matches": [{"team1_score": 21}]
            }
            
            result = await photo_match_service.check_idempotency("test-session")
            
            assert result is None
    
    @pytest.mark.asyncio
    async def test_returns_ids_when_created(self):
        """Test returns match IDs when already created."""
        with patch.object(photo_match_service, 'get_session_data') as mock_get:
            mock_get.return_value = {
                "matches_created": True,
                "created_match_ids": [1, 2, 3]
            }
            
            result = await photo_match_service.check_idempotency("test-session")
            
            assert result == [1, 2, 3]
    
    @pytest.mark.asyncio
    async def test_returns_none_when_session_missing(self):
        """Test returns None when session doesn't exist."""
        with patch.object(photo_match_service, 'get_session_data') as mock_get:
            mock_get.return_value = None
            
            result = await photo_match_service.check_idempotency("nonexistent")
            
            assert result is None


# ============================================================================
# Integration Tests with Mocked Gemini (clarification flow)
# ============================================================================

class TestClarifyScoresChat:
    """Integration tests for clarify_scores_chat with mocked Gemini."""

    @pytest.mark.asyncio
    async def test_clarification_returns_normalized_matches(self, sample_league_members):
        """Test clarification returns normalized match format."""
        raw_array = '[{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]'
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.candidates = [MagicMock()]
        mock_response.candidates[0].content = MagicMock()
        mock_response.candidates[0].content.parts = [MagicMock()]
        mock_response.candidates[0].content.parts[0].text = raw_array
        mock_client.models.generate_content.return_value = mock_response

        with patch.object(photo_match_service, 'get_gemini_client', return_value=mock_client):
            result = await photo_match_service.clarify_scores_chat(
                previous_response=raw_array,
                user_prompt="Match 1 score is 21-19.",
                league_members=sample_league_members,
            )
        assert result["status"] == "success"
        assert len(result["matches"]) == 1
        assert result["matches"][0]["team1_score"] == 21
        assert result["matches"][0]["team2_score"] == 19
        assert result["raw_response"] == raw_array

    @pytest.mark.asyncio
    async def test_clarification_handles_api_error(self, sample_league_members):
        """Test clarification handles Gemini API error."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API error")

        with patch.object(photo_match_service, 'get_gemini_client', return_value=mock_client):
            result = await photo_match_service.clarify_scores_chat(
                previous_response="[]",
                user_prompt="Fix the score.",
                league_members=sample_league_members,
            )
        assert result["status"] == "failed"
        assert "error_message" in result
        assert "API error" in result["error_message"]


# ============================================================================
# Stream consumer: STREAM_MSG_ERROR on Gemini exception
# ============================================================================

class TestRunGeminiStreamConsumer:
    """Tests for _run_gemini_stream_consumer error handling."""

    def test_puts_stream_msg_error_when_gemini_raises(self):
        """When Gemini thread raises, STREAM_MSG_ERROR is put on the queue with a safe message."""
        import queue as queue_module
        out_queue = queue_module.Queue()
        mock_client = MagicMock()
        mock_client.models.generate_content_stream.side_effect = RuntimeError("Gemini API failed")

        with patch.object(photo_match_service, 'get_gemini_client', return_value=mock_client):
            import threading
            t = threading.Thread(
                target=photo_match_service._run_gemini_stream_consumer,
                args=(out_queue, b"fake-image-bytes", "fake prompt"),
            )
            t.start()
            msg_type, msg = out_queue.get(timeout=2)
            t.join(timeout=1)

        assert msg_type == photo_match_service.STREAM_MSG_ERROR
        assert "Gemini API failed" in msg
        assert "Traceback" not in msg and "RuntimeError" not in msg


# ============================================================================
# SSE stream_photo_job_events generator
# ============================================================================

class TestStreamPhotoJobEvents:
    """Tests for stream_photo_job_events async generator."""

    @pytest.mark.asyncio
    async def test_yields_partial_then_done(self):
        """Generator yields partial when partial_matches change, then done when job completes."""
        from backend.database import db

        job_running = MagicMock()
        job_running.status = PhotoMatchJobStatus.RUNNING
        job_running.league_id = 1
        job_running.session_id = "s1"
        job_running.result_data = None

        job_completed = MagicMock()
        job_completed.status = PhotoMatchJobStatus.COMPLETED
        job_completed.league_id = 1
        job_completed.session_id = "s1"
        job_completed.result_data = json.dumps({"matches": [], "status": "success"})

        class FakeCM:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *args):
                pass

        events = []
        with patch.object(photo_match_service, 'get_photo_match_job', side_effect=[job_running, job_completed]):
            with patch.object(photo_match_service, 'get_session_data', return_value={"partial_matches": [{"t1": [], "t2": [], "s": "21-19"}]}):
                with patch.object(db, 'AsyncSessionLocal', lambda: FakeCM()):
                    async for event_name, data in photo_match_service.stream_photo_job_events(
                        job_id=1,
                        league_id=1,
                        session_id="s1",
                        poll_interval_sec=0.01,
                        timeout_sec=5,
                    ):
                        events.append((event_name, data))
                        if event_name == "done":
                            break

        assert len(events) >= 2
        assert events[0][0] == "partial"
        assert events[0][1].get("partial_matches") == [{"t1": [], "t2": [], "s": "21-19"}]
        assert events[-1][0] == "done"
        assert events[-1][1].get("status") == "COMPLETED"

    @pytest.mark.asyncio
    async def test_yields_error_when_job_not_found(self):
        """Generator yields error event when job is not found."""
        from backend.database import db

        class FakeCM:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *args):
                pass

        events = []
        with patch.object(photo_match_service, 'get_photo_match_job', return_value=None):
            with patch.object(db, 'AsyncSessionLocal', lambda: FakeCM()):
                async for event_name, data in photo_match_service.stream_photo_job_events(
                    job_id=999,
                    league_id=1,
                    session_id="s1",
                    poll_interval_sec=0.01,
                    timeout_sec=2,
                ):
                    events.append((event_name, data))
                    break

        assert len(events) == 1
        assert events[0][0] == "error"
        assert "not found" in events[0][1].get("message", "").lower()
