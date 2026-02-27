from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402


async def _set_admin(email: str, *, grant: bool) -> None:
    async with SessionLocal() as db:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            print(f"User not found: {email}")
            raise SystemExit(1)

        if grant and user.is_admin:
            print(f"User {email} is already an admin.")
            return
        if not grant and not user.is_admin:
            print(f"User {email} is not an admin.")
            return

        user.is_admin = grant
        await db.commit()
        action = "granted" if grant else "revoked"
        print(f"Admin access {action} for {email}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Grant or revoke admin access for a user.")
    parser.add_argument("--email", type=str, required=True, help="User email address")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--grant", action="store_true", help="Grant admin access")
    group.add_argument("--revoke", action="store_true", help="Revoke admin access")
    args = parser.parse_args()

    asyncio.run(_set_admin(args.email, grant=args.grant))


if __name__ == "__main__":
    main()
