"""Entrypoint for the separate moderation worker process."""

import asyncio

from backend.database.db import AsyncSessionLocal
from backend.services.moderation_worker import run_forever


if __name__ == "__main__":
    asyncio.run(run_forever(AsyncSessionLocal))
