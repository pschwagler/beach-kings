"""Entrypoint for the durable authentication delivery worker."""

import asyncio

from backend.database.db import AsyncSessionLocal
from backend.services.auth.auth_delivery_worker import run_forever


if __name__ == "__main__":
    asyncio.run(run_forever(AsyncSessionLocal))
