#!/usr/bin/env python3
"""
Initialize default database values.
This script is run on startup to populate default settings and other default values.
"""

import asyncio
from backend.database.db import AsyncSessionLocal
from backend.services import data_service


async def init_defaults():
    """Initialize default database values."""
    print("Initializing default database values...")

    async with AsyncSessionLocal() as session:
        # Default system admin phone number
        default_admin_phone = "+17167831211"

        # Get existing system admin phone numbers
        existing_admins = await data_service.get_setting(session, "system_admin_phone_numbers")

        if existing_admins:
            # Parse existing admins
            admin_set = {p.strip() for p in existing_admins.split(",") if p.strip()}

            # Add default admin if not already present
            if default_admin_phone not in admin_set:
                admin_set.add(default_admin_phone)
                # Update with merged list
                updated_value = ",".join(sorted(admin_set))
                await data_service.set_setting(
                    session, "system_admin_phone_numbers", updated_value
                )
                print(f"✓ Added default system admin: {default_admin_phone}")
            else:
                print(f"✓ Default system admin already exists: {default_admin_phone}")
        else:
            # No existing admins, set default
            await data_service.set_setting(
                session, "system_admin_phone_numbers", default_admin_phone
            )
            print(f"✓ Set default system admin: {default_admin_phone}")

        await session.commit()

    print("✓ Default values initialized")


if __name__ == "__main__":
    asyncio.run(init_defaults())
