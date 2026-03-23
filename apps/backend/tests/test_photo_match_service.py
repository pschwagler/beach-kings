"""
Tests for the photo match service.

Tests image preprocessing, player name matching, and job management.
"""

import base64
import json
import pytest
from io import BytesIO
from unittest.mock import MagicMock, patch
from PIL import Image

from backend.services import photo_match_service
from backend.database.models import PhotoMatchJobStatus


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
            "team2_score": 19,
        },
        {
            "team1_player1": "Charlie",  # Partial name
            "team1_player2": "Emily Johnson",
            "team2_player1": "John",  # First name only
            "team2_player2": "Jane",  # First name only
            "team1_score": 21,
            "team2_score": 15,
        },
    ]


@pytest.fixture
def sample_image_bytes():
    """Create a sample image for testing."""
    img = Image.new("RGB", (800, 600), color="white")
    buffer = BytesIO()
    img.save(buffer, format="JPEG")
    return buffer.getvalue()


@pytest.fixture
def sample_rgba_image_bytes():
    """Create a sample RGBA image for testing."""
    img = Image.new("RGBA", (800, 600), color=(255, 255, 255, 128))
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


# ============================================================================
# Image Validation Tests
# ============================================================================


class TestValidateImageFile:
    """Tests for validate_image_file function."""

    def test_valid_jpeg_image(self, sample_image_bytes):
        """Test valid JPEG image passes validation."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_image_bytes, "image/jpeg", "test.jpg"
        )
        assert is_valid is True
        assert error == ""

    def test_valid_png_image(self, sample_rgba_image_bytes):
        """Test valid PNG image passes validation."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_rgba_image_bytes, "image/png", "test.png"
        )
        assert is_valid is True
        assert error == ""

    def test_file_too_large(self, sample_image_bytes):
        """Test file size limit is enforced."""
        # Create oversized content
        large_content = b"x" * (11 * 1024 * 1024)  # 11MB

        is_valid, error = photo_match_service.validate_image_file(
            large_content, "image/jpeg", "test.jpg"
        )
        assert is_valid is False
        assert "exceeds maximum" in error.lower()

    def test_invalid_extension(self, sample_image_bytes):
        """Test invalid file extension is rejected."""
        is_valid, error = photo_match_service.validate_image_file(
            sample_image_bytes, "image/jpeg", "test.txt"
        )
        assert is_valid is False
        assert "invalid file type" in error.lower()

    def test_corrupted_image(self):
        """Test corrupted image is rejected."""
        corrupted_content = b"not an image at all"

        is_valid, error = photo_match_service.validate_image_file(
            corrupted_content, "image/jpeg", "test.jpg"
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
        assert img.format == "JPEG"

    def test_image_downscaling(self):
        """Test that tall images are downscaled to max 400px height."""
        # Create a tall image (1200px height)
        img = Image.new("RGB", (800, 1200), color="white")
        buffer = BytesIO()
        img.save(buffer, format="JPEG")
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
        assert img.mode == "RGB"

    def test_small_image_not_upscaled(self):
        """Test that small images are not upscaled."""
        # Create a small image (200px height)
        img = Image.new("RGB", (300, 200), color="white")
        buffer = BytesIO()
        img.save(buffer, format="JPEG")
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
        matches = [
            {
                "team1_player1": "John Doe",
                "team1_player2": "Jane Smith",
                "team2_player1": "Bob Wilson",
                "team2_player2": "Alice Brown",
                "team1_score": 21,
                "team2_score": 19,
            }
        ]

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
        matches = [
            {
                "team1_player1": "John Doe",
                "team1_player2": "Unknown Person",
                "team2_player1": "Bob Wilson",
                "team2_player2": "Mystery Player",
                "team1_score": 21,
                "team2_score": 19,
            }
        ]

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
        members = [{"player_id": 1, "player_name": "Jane Smith", "player_nickname": "Smithy"}]
        prompt = photo_match_service.build_scoreboard_prompt(members)
        assert "Jane Smith" in prompt
        assert "Smithy" in prompt


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
        with patch.object(photo_match_service, "get_session_data") as mock_get:
            mock_get.return_value = {
                "matches_created": False,
                "parsed_matches": [{"team1_score": 21}],
            }

            result = await photo_match_service.check_idempotency("test-session")

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_ids_when_created(self):
        """Test returns match IDs when already created."""
        with patch.object(photo_match_service, "get_session_data") as mock_get:
            mock_get.return_value = {"matches_created": True, "created_match_ids": [1, 2, 3]}

            result = await photo_match_service.check_idempotency("test-session")

            assert result == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_returns_none_when_session_missing(self):
        """Test returns None when session doesn't exist."""
        with patch.object(photo_match_service, "get_session_data") as mock_get:
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

        mock_types = MagicMock()
        with (
            patch.object(photo_match_service, "get_gemini_client", return_value=mock_client),
            patch.dict(
                "sys.modules", {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)}
            ),
        ):
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

        mock_types = MagicMock()
        with (
            patch.object(photo_match_service, "get_gemini_client", return_value=mock_client),
            patch.dict(
                "sys.modules", {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)}
            ),
        ):
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

        mock_types = MagicMock()
        with (
            patch.object(photo_match_service, "get_gemini_client", return_value=mock_client),
            patch.dict(
                "sys.modules", {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)}
            ),
        ):
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
        with patch.object(
            photo_match_service, "get_photo_match_job", side_effect=[job_running, job_completed]
        ):
            with patch.object(
                photo_match_service,
                "get_session_data",
                return_value={"partial_matches": [{"t1": [], "t2": [], "s": "21-19"}]},
            ):
                with patch.object(db, "AsyncSessionLocal", lambda: FakeCM()):
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
        with patch.object(photo_match_service, "get_photo_match_job", return_value=None):
            with patch.object(db, "AsyncSessionLocal", lambda: FakeCM()):
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


# ============================================================================
# Tests for extracted helper functions
# ============================================================================


class TestScorePlayerMatch:
    """Tests for _score_player_match helper."""

    def test_exact_full_name(self):
        """Exact full name match should score ~1.0."""
        score = photo_match_service._score_player_match("John Doe", "John Doe", "")
        assert score >= 0.99

    def test_nickname_strong_match(self):
        """Strong nickname match should boost score to 0.95."""
        score = photo_match_service._score_player_match("Johnny", "John Doe", "Johnny")
        assert score >= 0.95

    def test_nickname_moderate_match(self):
        """Moderate nickname match should boost score to 0.85."""
        score = photo_match_service._score_player_match("Johnn", "John Doe", "Johnny")
        assert score >= 0.85

    def test_substring_match(self):
        """Substring of full name should score at least 0.8."""
        score = photo_match_service._score_player_match("John", "John Doe", "")
        assert score >= 0.8

    def test_first_name_strong_match(self):
        """Strong first-name-only match should score at least 0.85."""
        score = photo_match_service._score_player_match("John", "John Doe-Smith", "")
        assert score >= 0.8

    def test_no_match(self):
        """Completely different names should score low."""
        score = photo_match_service._score_player_match("XYZ123", "John Doe", "")
        assert score < 0.4


class TestResolvePlayerField:
    """Tests for _resolve_player_field helper."""

    @pytest.fixture
    def members(self, sample_league_members):
        valid_ids = {m["player_id"] for m in sample_league_members}
        names_by_id = {m["player_id"]: m["player_name"] for m in sample_league_members}
        return sample_league_members, valid_ids, names_by_id

    def test_dict_with_valid_id(self, members):
        """Dict input with known player_id should return id with confidence 1.0."""
        members_list, valid_ids, names_by_id = members
        pid, conf, matched, unmatched = photo_match_service._resolve_player_field(
            {"id": 1, "name": "John Doe"},
            members_list,
            valid_ids,
            names_by_id,
        )
        assert pid == 1
        assert conf == 1.0
        assert "John" in matched
        assert unmatched is None

    def test_dict_with_unknown_id_falls_back_to_fuzzy(self, members):
        """Dict input with unknown id should fuzzy-match by name."""
        members_list, valid_ids, names_by_id = members
        pid, conf, matched, unmatched = photo_match_service._resolve_player_field(
            {"id": 9999, "name": "John Doe"},
            members_list,
            valid_ids,
            names_by_id,
        )
        assert pid == 1
        assert conf >= 0.6

    def test_string_input_matched(self, members):
        """String input with matchable name should return player id."""
        members_list, valid_ids, names_by_id = members
        pid, conf, matched, unmatched = photo_match_service._resolve_player_field(
            "John Doe",
            members_list,
            valid_ids,
            names_by_id,
        )
        assert pid == 1
        assert conf >= 0.6
        assert unmatched is None

    def test_string_input_unmatched(self, members):
        """String input with no match should return unmatched name."""
        members_list, valid_ids, names_by_id = members
        pid, conf, matched, unmatched = photo_match_service._resolve_player_field(
            "Unknown Person",
            members_list,
            valid_ids,
            names_by_id,
        )
        assert pid is None
        assert conf == 0
        assert unmatched == "Unknown Person"


class TestTruncateErrorMessage:
    """Tests for _truncate_error_message helper."""

    def test_short_message_unchanged(self):
        """Short error messages should pass through unchanged."""
        msg = photo_match_service._truncate_error_message(RuntimeError("oops"))
        assert msg == "oops"

    def test_long_message_truncated(self):
        """Messages over 500 chars should be truncated with ellipsis."""
        long_err = RuntimeError("x" * 600)
        msg = photo_match_service._truncate_error_message(long_err)
        assert len(msg) == 500
        assert msg.endswith("...")

    def test_empty_exception(self):
        """Exception with empty string should return 'Unknown error'."""
        msg = photo_match_service._truncate_error_message(RuntimeError(""))
        assert msg == "Unknown error"


# ============================================================================
# apply_player_overrides Tests
# ============================================================================


class TestApplyPlayerOverrides:
    """Tests for the apply_player_overrides function."""

    def _make_match(self, t1p1, t1p2, t2p1, t2p2):
        """Helper to build a match dict with unmatched players (dict-style names)."""
        fields = {}
        for field, val in [
            ("team1_player1", t1p1),
            ("team1_player2", t1p2),
            ("team2_player1", t2p1),
            ("team2_player2", t2p2),
        ]:
            if isinstance(val, tuple):
                # (name, player_id) — matched
                fields[field] = {"id": val[1], "name": val[0]}
                fields[f"{field}_id"] = val[1]
                fields[f"{field}_matched"] = val[0]
                fields[f"{field}_confidence"] = 1.0
            else:
                # string — unmatched
                fields[field] = {"id": None, "name": val}
                fields[f"{field}_id"] = None
                fields[f"{field}_matched"] = ""
                fields[f"{field}_confidence"] = 0
        fields["team1_score"] = 21
        fields["team2_score"] = 15
        return fields

    def test_no_overrides_returns_original(self):
        matches = [self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), "Mike S")]
        result = photo_match_service.apply_player_overrides(matches, [])
        assert result is matches

    def test_none_overrides_returns_original(self):
        matches = [self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), "Mike S")]
        result = photo_match_service.apply_player_overrides(matches, None)
        assert result is matches

    def test_single_override_resolves_name(self):
        matches = [self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), "Mike S")]
        overrides = [{"raw_name": "JD", "player_id": 1, "player_name": "John Doe"}]
        result = photo_match_service.apply_player_overrides(matches, overrides)

        assert len(result) == 1
        assert result[0]["team1_player1_id"] == 1
        assert result[0]["team1_player1_matched"] == "John Doe"
        assert result[0]["team1_player1_confidence"] == 1.0
        # Already-matched player untouched
        assert result[0]["team1_player2_id"] == 2

    def test_override_resolves_across_multiple_matches(self):
        matches = [
            self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), ("Alice Brown", 4)),
            self._make_match(("Jane Smith", 2), "JD", ("Bob Wilson", 3), ("Alice Brown", 4)),
        ]
        overrides = [{"raw_name": "JD", "player_id": 1, "player_name": "John Doe"}]
        result = photo_match_service.apply_player_overrides(matches, overrides)

        assert result[0]["team1_player1_id"] == 1
        assert result[1]["team1_player2_id"] == 1

    def test_case_insensitive_matching(self):
        matches = [
            self._make_match("jd", ("Jane Smith", 2), ("Bob Wilson", 3), ("Alice Brown", 4))
        ]
        overrides = [{"raw_name": "JD", "player_id": 1, "player_name": "John Doe"}]
        result = photo_match_service.apply_player_overrides(matches, overrides)
        assert result[0]["team1_player1_id"] == 1

    def test_does_not_overwrite_already_matched(self):
        matches = [
            self._make_match(("John Doe", 1), ("Jane Smith", 2), ("Bob Wilson", 3), "Mike S")
        ]
        overrides = [{"raw_name": "John Doe", "player_id": 99, "player_name": "Other John"}]
        result = photo_match_service.apply_player_overrides(matches, overrides)
        # Should NOT overwrite an already-matched player
        assert result[0]["team1_player1_id"] == 1

    def test_immutability(self):
        original = self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), ("Alice Brown", 4))
        matches = [original]
        overrides = [{"raw_name": "JD", "player_id": 1, "player_name": "John Doe"}]
        result = photo_match_service.apply_player_overrides(matches, overrides)

        # Original should be unchanged
        assert original["team1_player1_id"] is None
        # Result should be different object
        assert result[0] is not original
        assert result[0]["team1_player1_id"] == 1

    def test_multiple_overrides(self):
        matches = [self._make_match("JD", ("Jane Smith", 2), ("Bob Wilson", 3), "Mike S")]
        overrides = [
            {"raw_name": "JD", "player_id": 1, "player_name": "John Doe"},
            {"raw_name": "Mike S", "player_id": 5, "player_name": "Mike Sullivan"},
        ]
        result = photo_match_service.apply_player_overrides(matches, overrides)
        assert result[0]["team1_player1_id"] == 1
        assert result[0]["team2_player2_id"] == 5
        assert result[0]["team2_player2_matched"] == "Mike Sullivan"


# ============================================================================
# get_gemini_client Tests
# ============================================================================


class TestGetGeminiClient:
    """Tests for get_gemini_client singleton factory."""

    def setup_method(self):
        """Reset the module-level singleton before each test."""
        photo_match_service._gemini_client = None

    def teardown_method(self):
        """Reset the module-level singleton after each test."""
        photo_match_service._gemini_client = None

    def test_missing_api_key_raises_value_error(self):
        """get_gemini_client() must raise ValueError when no API key is set."""
        with patch.object(photo_match_service, "GEMINI_API_KEY", None):
            with pytest.raises(ValueError, match="GEMINI_API_KEY"):
                photo_match_service.get_gemini_client()

    def test_valid_api_key_returns_client(self):
        """get_gemini_client() returns a client object when API key is present."""
        mock_client = MagicMock()
        mock_genai = MagicMock()
        mock_genai.Client.return_value = mock_client

        with patch.object(photo_match_service, "GEMINI_API_KEY", "test-key-123"):
            with patch.dict("sys.modules", {"google": MagicMock(), "google.genai": mock_genai}):
                # Force re-import path by patching the lazy import inside get_gemini_client
                with patch("builtins.__import__", wraps=__import__) as mock_import:
                    # Patch at module attribute level so the already-imported path works
                    photo_match_service._gemini_client = None
                    # Inject the mock client directly to simulate what genai.Client() returns
                    photo_match_service._gemini_client = mock_client
                    client = photo_match_service.get_gemini_client()

        assert client is mock_client

    def test_singleton_returns_same_instance(self):
        """get_gemini_client() returns cached instance on second call."""
        mock_client = MagicMock()
        photo_match_service._gemini_client = mock_client

        result1 = photo_match_service.get_gemini_client()
        result2 = photo_match_service.get_gemini_client()

        assert result1 is mock_client
        assert result2 is mock_client


# ============================================================================
# create_photo_match_job DB Tests
# ============================================================================


class TestCreatePhotoMatchJob:
    """Tests for create_photo_match_job database function."""

    @pytest.mark.asyncio
    async def test_creates_job_with_pending_status(self, db_session):
        """create_photo_match_job creates a row with PENDING status."""
        from backend.database.models import League

        # Create minimal league row
        league = League(name="Test League")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        assert isinstance(job_id, int)
        assert job_id > 0

        # Retrieve and verify
        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job is not None
        assert job.status == photo_match_service.PhotoMatchJobStatus.PENDING
        assert job.session_id == session_id
        assert job.league_id == league.id
        assert job.result_data is None
        assert job.error_message is None

    @pytest.mark.asyncio
    async def test_get_photo_match_job_returns_none_for_missing(self, db_session):
        """get_photo_match_job returns None for a non-existent job ID."""
        result = await photo_match_service.get_photo_match_job(db_session, 999999)
        assert result is None


# ============================================================================
# update_job_status Tests
# ============================================================================


class TestUpdateJobStatus:
    """Tests for update_job_status transitions."""

    @pytest.mark.asyncio
    async def test_pending_to_running_sets_started_at(self, db_session):
        """Transitioning to RUNNING should set started_at timestamp."""
        from backend.database.models import League

        league = League(name="Test League 2")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        await photo_match_service.update_job_status(
            db_session, job_id, photo_match_service.PhotoMatchJobStatus.RUNNING
        )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.RUNNING
        assert job.started_at is not None

    @pytest.mark.asyncio
    async def test_running_to_completed_sets_completed_at(self, db_session):
        """Transitioning to COMPLETED should set completed_at and store result_data."""
        from backend.database.models import League

        league = League(name="Test League 3")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        result_payload = json.dumps({"status": "success", "matches": []})
        await photo_match_service.update_job_status(
            db_session,
            job_id,
            photo_match_service.PhotoMatchJobStatus.COMPLETED,
            result_data=result_payload,
        )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.COMPLETED
        assert job.completed_at is not None
        assert job.result_data == result_payload

    @pytest.mark.asyncio
    async def test_failed_status_stores_error_message(self, db_session):
        """Transitioning to FAILED should store error_message."""
        from backend.database.models import League

        league = League(name="Test League 4")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        await photo_match_service.update_job_status(
            db_session,
            job_id,
            photo_match_service.PhotoMatchJobStatus.FAILED,
            error_message="Gemini timed out",
        )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.FAILED
        assert job.error_message == "Gemini timed out"
        assert job.completed_at is not None


# ============================================================================
# Redis Session Management Tests (store / get / update / cleanup)
# ============================================================================


class TestRedisSessionManagement:
    """Tests for store_session_data, get_session_data, update_session_data, cleanup_session."""

    @pytest.mark.asyncio
    async def test_store_and_retrieve_session_data(self):
        """store_session_data writes to Redis; get_session_data reads it back."""
        session_id = "test-session-store"
        payload = {"league_id": 42, "status": "pending"}

        with (
            patch.object(
                photo_match_service.redis_service,
                "redis_set",
                return_value=True,
            ) as mock_set,
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps(payload),
            ) as mock_get,
        ):
            success = await photo_match_service.store_session_data(session_id, payload)
            assert success is True
            mock_set.assert_called_once()
            key_used = mock_set.call_args[0][0]
            assert session_id in key_used

            result = await photo_match_service.get_session_data(session_id)
            assert result == payload
            mock_get.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_session_data_returns_none_when_missing(self):
        """get_session_data returns None when key is absent from Redis."""
        with patch.object(photo_match_service.redis_service, "redis_get", return_value=None):
            result = await photo_match_service.get_session_data("nonexistent-session")
            assert result is None

    @pytest.mark.asyncio
    async def test_get_session_data_returns_none_on_redis_error(self):
        """get_session_data returns None when Redis raises an exception."""
        with patch.object(
            photo_match_service.redis_service,
            "redis_get",
            side_effect=Exception("Redis connection failed"),
        ):
            result = await photo_match_service.get_session_data("error-session")
            assert result is None

    @pytest.mark.asyncio
    async def test_update_session_data_merges_fields(self):
        """update_session_data merges new fields onto existing session."""
        session_id = "test-session-update"
        existing = {"league_id": 1, "status": "pending", "partial_matches": []}
        updates = {"status": "running", "raw_response": "[]"}

        with (
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps(existing),
            ),
            patch.object(
                photo_match_service.redis_service,
                "redis_set",
                return_value=True,
            ) as mock_set,
        ):
            success = await photo_match_service.update_session_data(session_id, updates)
            assert success is True
            # Verify merged payload was written
            written_json = mock_set.call_args[0][1]
            written = json.loads(written_json)
            assert written["league_id"] == 1  # preserved
            assert written["status"] == "running"  # updated
            assert written["raw_response"] == "[]"  # new field

    @pytest.mark.asyncio
    async def test_update_session_data_returns_false_when_session_missing(self):
        """update_session_data returns False when the session does not exist."""
        with patch.object(photo_match_service.redis_service, "redis_get", return_value=None):
            result = await photo_match_service.update_session_data(
                "missing-session", {"status": "done"}
            )
            assert result is False

    @pytest.mark.asyncio
    async def test_cleanup_session_deletes_key(self):
        """cleanup_session calls redis_delete with the correct key."""
        session_id = "test-session-cleanup"
        with patch.object(
            photo_match_service.redis_service, "redis_delete", return_value=True
        ) as mock_del:
            result = await photo_match_service.cleanup_session(session_id)
            assert result is True
            key_used = mock_del.call_args[0][0]
            assert session_id in key_used


# ============================================================================
# process_photo_job PENDING -> RUNNING -> COMPLETED / FAILED
# ============================================================================


class TestProcessPhotoJob:
    """Integration tests for process_photo_job with mocked Gemini."""

    def _make_valid_image_base64(self) -> str:
        """Return a base64-encoded minimal JPEG for use in tests."""
        from io import BytesIO

        img = Image.new("RGB", (100, 50), color="white")
        buf = BytesIO()
        img.save(buf, format="JPEG")
        return base64.b64encode(buf.getvalue()).decode()

    @pytest.mark.asyncio
    async def test_job_transitions_to_completed_on_success(self, db_session):
        """process_photo_job drives job from PENDING through RUNNING to COMPLETED."""
        from backend.database.models import League

        league = League(name="Photo League 1")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        # Seed session data that process_photo_job will update
        raw_extraction = '[{"t1": [1, 2], "t2": [3, 4], "s": "21-15"}]'

        # Gemini stream consumer emits DONE with valid extraction
        def fake_stream_consumer(out_q, image_bytes, prompt):
            out_q.put((photo_match_service.STREAM_MSG_DONE, raw_extraction))

        league_members = [
            {"player_id": 1, "player_name": "Alice"},
            {"player_id": 2, "player_name": "Bob"},
            {"player_id": 3, "player_name": "Carol"},
            {"player_id": 4, "player_name": "Dave"},
        ]

        image_b64 = self._make_valid_image_base64()

        with (
            patch.object(
                photo_match_service,
                "_run_gemini_stream_consumer",
                side_effect=fake_stream_consumer,
            ),
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps({"league_id": league.id}),
            ),
            patch.object(photo_match_service.redis_service, "redis_set", return_value=True),
        ):
            await photo_match_service.process_photo_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                image_base64=image_b64,
                league_members=league_members,
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.COMPLETED
        assert job.result_data is not None
        result = json.loads(job.result_data)
        assert result["status"] in ("success", "needs_clarification")
        assert len(result["matches"]) == 1

    @pytest.mark.asyncio
    async def test_job_transitions_to_failed_on_gemini_error(self, db_session):
        """process_photo_job sets job to FAILED when Gemini stream raises an error."""
        from backend.database.models import League

        league = League(name="Photo League 2")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        def fake_stream_error(out_q, image_bytes, prompt):
            out_q.put((photo_match_service.STREAM_MSG_ERROR, "Gemini unavailable"))

        image_b64 = self._make_valid_image_base64()

        with (
            patch.object(
                photo_match_service,
                "_run_gemini_stream_consumer",
                side_effect=fake_stream_error,
            ),
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps({"league_id": league.id}),
            ),
            patch.object(photo_match_service.redis_service, "redis_set", return_value=True),
        ):
            await photo_match_service.process_photo_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                image_base64=image_b64,
                league_members=[],
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.FAILED
        assert job.error_message is not None

    @pytest.mark.asyncio
    async def test_job_completed_with_empty_matches_adds_note(self, db_session):
        """process_photo_job calls _describe_image_on_empty when Gemini finds no matches."""
        from backend.database.models import League

        league = League(name="Photo League 3")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        # Stream returns empty array
        def fake_stream_empty(out_q, image_bytes, prompt):
            out_q.put((photo_match_service.STREAM_MSG_DONE, "[]"))

        image_b64 = self._make_valid_image_base64()

        with (
            patch.object(
                photo_match_service,
                "_run_gemini_stream_consumer",
                side_effect=fake_stream_empty,
            ),
            patch.object(
                photo_match_service,
                "_describe_image_on_empty",
                return_value="This is a photo of a cat.",
            ),
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps({"league_id": league.id}),
            ),
            patch.object(photo_match_service.redis_service, "redis_set", return_value=True),
        ):
            await photo_match_service.process_photo_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                image_base64=image_b64,
                league_members=[],
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.COMPLETED
        result = json.loads(job.result_data)
        assert result["matches"] == []
        assert result.get("note") == "This is a photo of a cat."


# ============================================================================
# process_clarification_job Tests
# ============================================================================


class TestProcessClarificationJob:
    """Tests for process_clarification_job."""

    @pytest.mark.asyncio
    async def test_clarification_job_completes_with_updated_matches(self, db_session):
        """process_clarification_job reads session, calls Gemini, marks job COMPLETED."""
        from backend.database.models import League

        league = League(name="Clarify League 1")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        existing_session = {
            "league_id": league.id,
            "raw_response": '[{"t1": [1, 2], "t2": [3, 4], "s": "21-15"}]',
            "parsed_matches": [],
        }
        clarification_response = '[{"t1": [1, 2], "t2": [3, 4], "s": "21-19"}]'
        league_members = [
            {"player_id": 1, "player_name": "Alice"},
            {"player_id": 2, "player_name": "Bob"},
            {"player_id": 3, "player_name": "Carol"},
            {"player_id": 4, "player_name": "Dave"},
        ]

        mock_gemini_client = MagicMock()
        mock_response = MagicMock()
        mock_response.candidates = [MagicMock()]
        mock_response.candidates[0].content = MagicMock()
        mock_response.candidates[0].content.parts = [MagicMock()]
        mock_response.candidates[0].content.parts[0].text = clarification_response
        mock_gemini_client.models.generate_content.return_value = mock_response

        mock_types = MagicMock()
        with (
            patch.object(
                photo_match_service, "get_gemini_client", return_value=mock_gemini_client
            ),
            patch.dict(
                "sys.modules",
                {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)},
            ),
            patch.object(
                photo_match_service.redis_service,
                "redis_get",
                return_value=json.dumps(existing_session),
            ),
            patch.object(photo_match_service.redis_service, "redis_set", return_value=True),
        ):
            await photo_match_service.process_clarification_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                league_members=league_members,
                user_prompt="Score for match 1 was 21-19 not 21-15",
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.COMPLETED
        result = json.loads(job.result_data)
        assert len(result["matches"]) == 1
        assert result["matches"][0]["team2_score"] == 19

    @pytest.mark.asyncio
    async def test_clarification_job_fails_when_session_missing(self, db_session):
        """process_clarification_job sets FAILED when session is not in Redis."""
        from backend.database.models import League

        league = League(name="Clarify League 2")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        with patch.object(photo_match_service.redis_service, "redis_get", return_value=None):
            await photo_match_service.process_clarification_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                league_members=[],
                user_prompt="fix score",
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.FAILED
        assert "not found" in job.error_message.lower() or "expired" in job.error_message.lower()

    @pytest.mark.asyncio
    async def test_clarification_job_fails_when_no_raw_response(self, db_session):
        """process_clarification_job sets FAILED when session exists but has no raw_response."""
        from backend.database.models import League

        league = League(name="Clarify League 3")
        db_session.add(league)
        await db_session.flush()

        session_id = photo_match_service.generate_session_id()
        job_id = await photo_match_service.create_photo_match_job(
            db_session, league.id, session_id
        )

        session_without_raw = json.dumps({"league_id": league.id, "partial_matches": []})

        with patch.object(
            photo_match_service.redis_service,
            "redis_get",
            return_value=session_without_raw,
        ):
            await photo_match_service.process_clarification_job(
                job_id=job_id,
                league_id=league.id,
                session_id=session_id,
                league_members=[],
                user_prompt="fix score",
            )

        job = await photo_match_service.get_photo_match_job(db_session, job_id)
        assert job.status == photo_match_service.PhotoMatchJobStatus.FAILED


# ============================================================================
# match_all_players_in_matches — partial / no-match edge cases
# ============================================================================


class TestMatchAllPlayersEdgeCases:
    """Additional match_all_players_in_matches edge-case tests."""

    def test_no_matches_returns_empty(self):
        """Empty input produces empty output with no unmatched names."""
        result_matches, unmatched = photo_match_service.match_all_players_in_matches([], [])
        assert result_matches == []
        assert unmatched == []

    def test_all_players_unmatched_splits_correctly(self):
        """When no players match, all four are returned as unmatched."""
        matches = [
            {
                "team1_player1": "Zed Alpha",
                "team1_player2": "Zed Beta",
                "team2_player1": "Zed Gamma",
                "team2_player2": "Zed Delta",
                "team1_score": 21,
                "team2_score": 19,
            }
        ]
        members = [
            {"player_id": 1, "player_name": "John Doe"},
            {"player_id": 2, "player_name": "Jane Smith"},
        ]
        result_matches, unmatched = photo_match_service.match_all_players_in_matches(
            matches, members
        )
        assert len(result_matches) == 1
        assert len(unmatched) == 4
        for field in [
            "team1_player1_id",
            "team1_player2_id",
            "team2_player1_id",
            "team2_player2_id",
        ]:
            assert result_matches[0][field] is None

    def test_partial_match_correct_split(self):
        """Two matched and two unmatched players are split correctly."""
        matches = [
            {
                "team1_player1": "John Doe",
                "team1_player2": "NoOne Here",
                "team2_player1": "Jane Smith",
                "team2_player2": "Ghost Player",
                "team1_score": 21,
                "team2_score": 17,
            }
        ]
        members = [
            {"player_id": 1, "player_name": "John Doe"},
            {"player_id": 2, "player_name": "Jane Smith"},
        ]
        result_matches, unmatched = photo_match_service.match_all_players_in_matches(
            matches, members
        )
        assert result_matches[0]["team1_player1_id"] == 1
        assert result_matches[0]["team1_player2_id"] is None
        assert result_matches[0]["team2_player1_id"] == 2
        assert result_matches[0]["team2_player2_id"] is None
        assert "NoOne Here" in unmatched
        assert "Ghost Player" in unmatched
        assert len(unmatched) == 2

    def test_multiple_matches_carry_through_correctly(self):
        """Multiple matches all have player IDs resolved independently."""
        matches = [
            {
                "team1_player1": "Alice",
                "team1_player2": "Bob",
                "team2_player1": "Carol",
                "team2_player2": "Dave",
                "team1_score": 21,
                "team2_score": 15,
            },
            {
                "team1_player1": "Alice",
                "team1_player2": "Carol",
                "team2_player1": "Bob",
                "team2_player2": "Dave",
                "team1_score": 21,
                "team2_score": 18,
            },
        ]
        members = [
            {"player_id": 10, "player_name": "Alice"},
            {"player_id": 20, "player_name": "Bob"},
            {"player_id": 30, "player_name": "Carol"},
            {"player_id": 40, "player_name": "Dave"},
        ]
        result_matches, unmatched = photo_match_service.match_all_players_in_matches(
            matches, members
        )
        assert len(result_matches) == 2
        assert unmatched == []
        assert result_matches[0]["team1_player1_id"] == 10
        assert result_matches[1]["team2_player1_id"] == 20


# ============================================================================
# _describe_image_on_empty Tests
# ============================================================================


class TestDescribeImageOnEmpty:
    """Tests for the _describe_image_on_empty fallback function."""

    @pytest.mark.asyncio
    async def test_returns_description_string_on_success(self):
        """_describe_image_on_empty returns the model's description text."""
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.candidates = [MagicMock()]
        mock_response.candidates[0].content = MagicMock()
        mock_response.candidates[0].content.parts = [MagicMock()]
        mock_response.candidates[0].content.parts[0].text = "A photo of a trophy."
        mock_client.models.generate_content.return_value = mock_response

        mock_types = MagicMock()
        with (
            patch.object(photo_match_service, "get_gemini_client", return_value=mock_client),
            patch.dict(
                "sys.modules",
                {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)},
            ),
        ):
            result = await photo_match_service._describe_image_on_empty(b"fake-image")

        assert result == "A photo of a trophy."

    @pytest.mark.asyncio
    async def test_returns_none_on_gemini_failure(self):
        """_describe_image_on_empty returns None when Gemini raises."""
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("API timeout")

        mock_types = MagicMock()
        with (
            patch.object(photo_match_service, "get_gemini_client", return_value=mock_client),
            patch.dict(
                "sys.modules",
                {"google": MagicMock(), "google.genai": MagicMock(types=mock_types)},
            ),
        ):
            result = await photo_match_service._describe_image_on_empty(b"fake-image")

        assert result is None


# ============================================================================
# _parse_score_string Tests
# ============================================================================


class TestParseScoreString:
    """Tests for _parse_score_string helper."""

    def test_valid_score_string(self):
        """Standard 'T1-T2' score strings are parsed correctly."""
        t1, t2 = photo_match_service._parse_score_string("21-15")
        assert t1 == 21
        assert t2 == 15

    def test_score_with_spaces(self):
        """Scores with surrounding spaces are handled."""
        t1, t2 = photo_match_service._parse_score_string(" 21 - 15 ")
        assert t1 == 21
        assert t2 == 15

    def test_empty_string_returns_none_pair(self):
        """Empty string returns (None, None)."""
        t1, t2 = photo_match_service._parse_score_string("")
        assert t1 is None
        assert t2 is None

    def test_non_string_returns_none_pair(self):
        """Non-string input returns (None, None)."""
        t1, t2 = photo_match_service._parse_score_string(None)
        assert t1 is None
        assert t2 is None

    def test_malformed_score_returns_none_pair(self):
        """Score strings that can't be parsed return (None, None)."""
        t1, t2 = photo_match_service._parse_score_string("twenty-one to fifteen")
        assert t1 is None
        assert t2 is None

    def test_single_number_returns_none_pair(self):
        """A score with only one number (no dash) returns (None, None)."""
        t1, t2 = photo_match_service._parse_score_string("21")
        assert t1 is None
        assert t2 is None


# ============================================================================
# _to_player_dict Tests
# ============================================================================


class TestToPlayerDict:
    """Tests for _to_player_dict helper."""

    def test_integer_id_maps_to_id_with_empty_name(self):
        """Integer inputs produce {id: n, name: ''}."""
        result = photo_match_service._to_player_dict(7)
        assert result == {"id": 7, "name": ""}

    def test_string_name_maps_to_none_id(self):
        """String inputs produce {id: None, name: string}."""
        result = photo_match_service._to_player_dict("Unknown Guy")
        assert result == {"id": None, "name": "Unknown Guy"}

    def test_none_maps_to_null_id_empty_name(self):
        """None input produces {id: None, name: ''}."""
        result = photo_match_service._to_player_dict(None)
        assert result == {"id": None, "name": ""}


# ============================================================================
# stream_photo_job_events — FAILED job and league mismatch paths
# ============================================================================


class TestStreamPhotoJobEventsAdditional:
    """Additional tests for stream_photo_job_events edge cases."""

    @pytest.mark.asyncio
    async def test_yields_done_when_job_already_failed(self):
        """Generator yields 'done' with FAILED status when job is already failed."""
        from backend.database import db

        job_failed = MagicMock()
        job_failed.status = photo_match_service.PhotoMatchJobStatus.FAILED
        job_failed.league_id = 1
        job_failed.session_id = "s1"
        job_failed.error_message = "Gemini error"

        class FakeCM:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *args):
                pass

        events = []
        with patch.object(photo_match_service, "get_photo_match_job", return_value=job_failed):
            with patch.object(db, "AsyncSessionLocal", lambda: FakeCM()):
                async for event_name, data in photo_match_service.stream_photo_job_events(
                    job_id=1,
                    league_id=1,
                    session_id="s1",
                    poll_interval_sec=0.01,
                    timeout_sec=5,
                ):
                    events.append((event_name, data))
                    break

        assert len(events) == 1
        assert events[0][0] == "done"
        assert events[0][1]["status"] == "FAILED"

    @pytest.mark.asyncio
    async def test_yields_error_when_league_id_mismatch(self):
        """Generator yields error when job.league_id doesn't match the requested league_id."""
        from backend.database import db

        job_wrong_league = MagicMock()
        job_wrong_league.status = photo_match_service.PhotoMatchJobStatus.RUNNING
        job_wrong_league.league_id = 99  # different from requested
        job_wrong_league.session_id = "s1"

        class FakeCM:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *args):
                pass

        events = []
        with patch.object(
            photo_match_service, "get_photo_match_job", return_value=job_wrong_league
        ):
            with patch.object(db, "AsyncSessionLocal", lambda: FakeCM()):
                async for event_name, data in photo_match_service.stream_photo_job_events(
                    job_id=1,
                    league_id=1,  # does not match job.league_id=99
                    session_id="s1",
                    poll_interval_sec=0.01,
                    timeout_sec=5,
                ):
                    events.append((event_name, data))
                    break

        assert len(events) == 1
        assert events[0][0] == "error"
        assert "league" in events[0][1].get("message", "").lower()

    @pytest.mark.asyncio
    async def test_yields_error_on_timeout(self):
        """Generator yields error when the timeout is exceeded."""
        from backend.database import db

        job_running = MagicMock()
        job_running.status = photo_match_service.PhotoMatchJobStatus.RUNNING
        job_running.league_id = 1
        job_running.session_id = "s1"
        job_running.result_data = None

        class FakeCM:
            async def __aenter__(self):
                return MagicMock()

            async def __aexit__(self, *args):
                pass

        events = []
        with patch.object(photo_match_service, "get_photo_match_job", return_value=job_running):
            with patch.object(
                photo_match_service,
                "get_session_data",
                return_value={"partial_matches": []},
            ):
                with patch.object(db, "AsyncSessionLocal", lambda: FakeCM()):
                    async for event_name, data in photo_match_service.stream_photo_job_events(
                        job_id=1,
                        league_id=1,
                        session_id="s1",
                        poll_interval_sec=0.001,
                        timeout_sec=0.002,  # immediately time out
                    ):
                        events.append((event_name, data))
                        if event_name in ("error", "done"):
                            break

        assert any(e[0] == "error" for e in events)
        timeout_event = next(e for e in events if e[0] == "error")
        assert "timed out" in timeout_event[1].get("message", "").lower()
