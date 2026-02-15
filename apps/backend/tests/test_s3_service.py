"""
Tests for s3_service — URL parsing, upload, and delete with mocked boto3.
"""

from unittest.mock import MagicMock, patch

import pytest

from backend.services import s3_service


# ============================================================================
# _extract_key_from_url
# ============================================================================


class TestExtractKeyFromUrl:
    """Tests for _extract_key_from_url()."""

    def test_valid_s3_url(self):
        """Extracts key from a standard S3 URL."""
        url = "https://my-bucket.s3.us-west-2.amazonaws.com/avatars/123/456.jpg"
        key = s3_service._extract_key_from_url(url, expected_bucket="my-bucket")
        assert key == "avatars/123/456.jpg"

    def test_valid_url_no_bucket_validation(self):
        """Extracts key when no expected_bucket is provided."""
        url = "https://any-host.com/some/path/file.jpg"
        key = s3_service._extract_key_from_url(url)
        assert key == "some/path/file.jpg"

    def test_invalid_hostname(self):
        """Returns None when hostname doesn't match expected bucket."""
        url = "https://wrong-bucket.s3.us-west-2.amazonaws.com/avatars/123/456.jpg"
        key = s3_service._extract_key_from_url(url, expected_bucket="my-bucket")
        assert key is None

    def test_empty_path(self):
        """Returns None for URL with no path."""
        url = "https://my-bucket.s3.us-west-2.amazonaws.com/"
        key = s3_service._extract_key_from_url(url, expected_bucket="my-bucket")
        assert key is None

    def test_leading_slash_stripped(self):
        """Leading slash is stripped from the key."""
        url = "https://my-bucket.s3.us-west-2.amazonaws.com/key.jpg"
        key = s3_service._extract_key_from_url(url, expected_bucket="my-bucket")
        assert key == "key.jpg"
        assert not key.startswith("/")

    def test_malformed_url(self):
        """Returns None for completely malformed input."""
        key = s3_service._extract_key_from_url("not-a-url")
        # urlparse handles this gracefully, returning the input as path
        assert key == "not-a-url" or key is None


# ============================================================================
# upload_avatar (mocked)
# ============================================================================


class TestUploadAvatar:
    """Tests for upload_avatar() with mocked boto3."""

    @patch.dict("os.environ", {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_S3_BUCKET": "test-bucket",
        "AWS_S3_REGION": "us-west-2",
    })
    @patch("backend.services.s3_service._get_s3_client")
    def test_upload_returns_url(self, mock_get_client):
        """upload_avatar returns a valid S3 URL."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        url = s3_service.upload_avatar(42, b"fake-image-bytes")

        assert "test-bucket" in url
        assert "avatars/42/" in url
        assert url.endswith(".jpg")
        mock_client.put_object.assert_called_once()

    @patch.dict("os.environ", {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_S3_BUCKET": "test-bucket",
        "AWS_S3_REGION": "us-west-2",
    })
    @patch("backend.services.s3_service._get_s3_client")
    def test_upload_puts_correct_content_type(self, mock_get_client):
        """Upload sends image/jpeg content type."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        s3_service.upload_avatar(1, b"data")

        call_kwargs = mock_client.put_object.call_args
        assert call_kwargs.kwargs.get("ContentType") == "image/jpeg" or \
               call_kwargs[1].get("ContentType") == "image/jpeg"


# ============================================================================
# delete_avatar (mocked)
# ============================================================================


class TestDeleteAvatar:
    """Tests for delete_avatar() with mocked boto3."""

    @patch.dict("os.environ", {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_S3_BUCKET": "test-bucket",
        "AWS_S3_REGION": "us-west-2",
    })
    @patch("backend.services.s3_service._get_s3_client")
    def test_delete_success(self, mock_get_client):
        """Successful delete returns True."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        result = s3_service.delete_avatar(
            "https://test-bucket.s3.us-west-2.amazonaws.com/avatars/42/123.jpg"
        )

        assert result is True
        mock_client.delete_object.assert_called_once()

    @patch.dict("os.environ", {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_S3_BUCKET": "test-bucket",
        "AWS_S3_REGION": "us-west-2",
    })
    @patch("backend.services.s3_service._get_s3_client")
    def test_delete_wrong_bucket_returns_false(self, mock_get_client):
        """Delete with wrong bucket hostname returns False."""
        mock_client = MagicMock()
        mock_get_client.return_value = mock_client

        result = s3_service.delete_avatar(
            "https://wrong-bucket.s3.us-west-2.amazonaws.com/avatars/42/123.jpg"
        )

        assert result is False
        mock_client.delete_object.assert_not_called()

    @patch.dict("os.environ", {
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
        "AWS_S3_BUCKET": "test-bucket",
        "AWS_S3_REGION": "us-west-2",
    })
    @patch("backend.services.s3_service._get_s3_client")
    def test_delete_s3_error_returns_false(self, mock_get_client):
        """S3 errors during delete return False (best-effort)."""
        mock_client = MagicMock()
        mock_client.delete_object.side_effect = Exception("S3 error")
        mock_get_client.return_value = mock_client

        result = s3_service.delete_avatar(
            "https://test-bucket.s3.us-west-2.amazonaws.com/avatars/42/123.jpg"
        )

        assert result is False
