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
        
        # Verify height is reduced
        result_img = Image.open(BytesIO(processed_bytes))
        assert result_img.height <= 400
        # Verify aspect ratio is maintained (approximately)
        expected_width = int(800 * (400 / 1200))
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
# OpenAI Response Parsing Tests
# ============================================================================

class TestParseOpenAIResponse:
    """Tests for parse_openai_response function."""
    
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
    
    def test_parse_json_without_language_tag(self):
        """Test parsing JSON in markdown without language tag."""
        response = '''```
{"status": "needs_clarification", "clarification_question": "Who is JD?"}
```'''
        
        result = photo_match_service.parse_openai_response(response)
        
        assert result["status"] == "needs_clarification"
    
    def test_parse_embedded_json(self):
        """Test parsing JSON embedded in text."""
        response = 'The result is {"status": "success", "matches": []} based on the image.'
        
        result = photo_match_service.parse_openai_response(response)
        
        assert result["status"] == "success"
    
    def test_parse_invalid_json(self):
        """Test parsing invalid JSON raises error."""
        response = "This is not JSON at all"
        
        with pytest.raises(ValueError):
            photo_match_service.parse_openai_response(response)


# ============================================================================
# System Prompt Tests
# ============================================================================

class TestBuildSystemPrompt:
    """Tests for build_system_prompt function."""
    
    def test_includes_all_members(self, sample_league_members):
        """Test system prompt includes all league members."""
        prompt = photo_match_service.build_system_prompt(sample_league_members)
        
        assert "John Doe" in prompt
        assert "Jane Smith" in prompt
        assert "Bob Wilson" in prompt
        assert "Alice Brown" in prompt
    
    def test_includes_instructions(self, sample_league_members):
        """Test system prompt includes instructions."""
        prompt = photo_match_service.build_system_prompt(sample_league_members)
        
        assert "extract" in prompt.lower()
        assert "volleyball" in prompt.lower()
        assert "json" in prompt.lower()
    
    def test_includes_response_format(self, sample_league_members):
        """Test system prompt includes response format."""
        prompt = photo_match_service.build_system_prompt(sample_league_members)
        
        assert "status" in prompt
        assert "success" in prompt
        assert "needs_clarification" in prompt
        assert "unreadable" in prompt


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
# Integration Tests with Mocked OpenAI
# ============================================================================

class TestProcessPhotoWithOpenAI:
    """Integration tests for process_photo_with_openai with mocked OpenAI."""
    
    @pytest.mark.asyncio
    async def test_successful_extraction(self, sample_league_members):
        """Test successful match extraction from photo."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "status": "success",
            "matches": [{
                "team1_player1": "John Doe",
                "team1_player2": "Jane Smith",
                "team2_player1": "Bob Wilson",
                "team2_player2": "Alice Brown",
                "team1_score": 21,
                "team2_score": 19
            }]
        })
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(photo_match_service, 'get_openai_client', return_value=mock_client):
            result = await photo_match_service.process_photo_with_openai(
                image_base64="base64data",
                league_members=sample_league_members,
                conversation_history=[]
            )
        
        assert result["status"] == "success"
        assert len(result["matches"]) == 1
        assert "conversation" in result
    
    @pytest.mark.asyncio
    async def test_needs_clarification(self, sample_league_members):
        """Test response when clarification is needed."""
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({
            "status": "needs_clarification",
            "matches": [],
            "clarification_question": "I can't read the second score. Is it 21-19 or 21-17?"
        })
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create.return_value = mock_response
        
        with patch.object(photo_match_service, 'get_openai_client', return_value=mock_client):
            result = await photo_match_service.process_photo_with_openai(
                image_base64="base64data",
                league_members=sample_league_members,
                conversation_history=[]
            )
        
        assert result["status"] == "needs_clarification"
        assert "clarification_question" in result
    
    @pytest.mark.asyncio
    async def test_handles_api_error(self, sample_league_members):
        """Test handling of OpenAI API error."""
        mock_client = AsyncMock()
        mock_client.chat.completions.create.side_effect = Exception("API rate limit exceeded")
        
        with patch.object(photo_match_service, 'get_openai_client', return_value=mock_client):
            result = await photo_match_service.process_photo_with_openai(
                image_base64="base64data",
                league_members=sample_league_members,
                conversation_history=[]
            )
        
        assert result["status"] == "failed"
        assert "error_message" in result
        assert "rate limit" in result["error_message"].lower()
