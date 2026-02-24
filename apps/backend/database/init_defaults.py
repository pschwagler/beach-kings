#!/usr/bin/env python3
"""
Initialize default database values.
This script is run on startup to populate default settings and other default values.
"""

import asyncio
import os

from backend.database.db import AsyncSessionLocal
from backend.services import data_service


async def init_defaults():
    """Initialize default database values.

    Reads DEFAULT_ADMIN_PHONE from the environment. If unset, skips
    admin seeding (useful in CI/test where no default admin is needed).
    """
    print("Initializing default database values...")

    async with AsyncSessionLocal() as session:
        default_admin_phone = os.getenv("DEFAULT_ADMIN_PHONE")

        if not default_admin_phone:
            print("⚠ DEFAULT_ADMIN_PHONE not set — skipping admin seeding")
        else:
            # Get existing system admin phone numbers
            existing_admins = await data_service.get_setting(
                session, "system_admin_phone_numbers"
            )

            if existing_admins:
                admin_set = {p.strip() for p in existing_admins.split(",") if p.strip()}

                if default_admin_phone not in admin_set:
                    admin_set.add(default_admin_phone)
                    updated_value = ",".join(sorted(admin_set))
                    await data_service.set_setting(
                        session, "system_admin_phone_numbers", updated_value
                    )
                    print(f"✓ Added default system admin: {default_admin_phone}")
                else:
                    print("✓ Default system admin already exists")
            else:
                await data_service.set_setting(
                    session, "system_admin_phone_numbers", default_admin_phone
                )
                print(f"✓ Set default system admin: {default_admin_phone}")

        await session.commit()

    print("✓ Default values initialized")


if __name__ == "__main__":
    asyncio.run(init_defaults())
