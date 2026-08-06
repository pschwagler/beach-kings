"""Entrypoint for the separate durable push-delivery worker."""

import asyncio

from backend.database.db import AsyncSessionLocal
from backend.services.push_worker import run_forever


if __name__ == "__main__":
    asyncio.run(run_forever(AsyncSessionLocal))
