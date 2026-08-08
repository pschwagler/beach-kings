"""Pure tests for durable media cleanup used by permanent account deletion."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services import media_deletion_worker, user_service


class _Rows:
    def __init__(self, values):
        self._values = values

    def all(self):
        return [(value,) for value in self._values]


@pytest.mark.asyncio
async def test_account_deletion_enqueues_avatar_standalone_and_review_photos():
    player = SimpleNamespace(
        profile_picture_url="https://media.s3.us-west-2.amazonaws.com/avatars/7/avatar.jpg"
    )
    session = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _Rows(["court-photos/7/standalone.jpg"]),
                _Rows(["court-reviews/7/review.jpg"]),
            ]
        ),
        add_all=MagicMock(),
    )

    await user_service._enqueue_s3_deletions(player, 7, session)

    jobs = session.add_all.call_args.args[0]
    assert {job.object_key for job in jobs} == {
        "avatars/7/avatar.jpg",
        "court-photos/7/standalone.jpg",
        "court-reviews/7/review.jpg",
    }


@pytest.mark.parametrize(
    "url",
    [
        "https://images.example.com/avatars/7/avatar.jpg",
        "http://media.s3.us-west-2.amazonaws.com/avatars/7/avatar.jpg",
        "https://media.s3.us-west-2.amazonaws.com/avatars/8/avatar.jpg",
        "https://media.s3.us-west-2.amazonaws.com/not-avatars/7/avatar.jpg",
    ],
)
def test_only_app_owned_avatar_urls_become_deletion_keys(url):
    assert user_service._managed_avatar_key(url, 7) is None


@pytest.mark.asyncio
async def test_successful_s3_delete_completes_job():
    job = SimpleNamespace(
        object_key="court-photos/7/photo.jpg",
        status="processing",
        claimed_at=object(),
        completed_at=None,
        last_error="old error",
    )
    session = SimpleNamespace(flush=AsyncMock())

    with patch(
        "backend.services.s3_service.delete_file", MagicMock(return_value=True)
    ) as delete_file:
        completed = await media_deletion_worker.process_job(session, job)

    assert completed is True
    delete_file.assert_called_once_with(job.object_key)
    assert job.status == "completed"
    assert job.completed_at is not None
    assert job.last_error is None


@pytest.mark.asyncio
async def test_failed_s3_delete_remains_pending_for_retry():
    job = SimpleNamespace(
        object_key="court-reviews/7/photo.jpg",
        attempts=3,
        status="processing",
        claimed_at=object(),
        available_at=None,
        last_error=None,
    )
    session = SimpleNamespace(flush=AsyncMock())

    with patch("backend.services.s3_service.delete_file", MagicMock(return_value=False)):
        completed = await media_deletion_worker.process_job(session, job)

    assert completed is False
    assert job.status == "pending"
    assert job.claimed_at is None
    assert job.available_at is not None
    assert job.last_error == "S3 deletion did not succeed"


def test_retry_is_never_discarded_after_many_attempts():
    job = SimpleNamespace(
        attempts=100,
        status="processing",
        claimed_at=object(),
        available_at=None,
        last_error=None,
    )

    media_deletion_worker.mark_retry(job, "provider unavailable")

    assert job.status == "pending"
    assert job.available_at is not None
