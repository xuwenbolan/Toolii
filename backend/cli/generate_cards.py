from __future__ import annotations

import argparse
import asyncio
import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
import string
import sys


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import SessionLocal  # noqa: E402
from app.models.card_code import CardCode  # noqa: E402
from app.utils.hash_utils import sha256_hex  # noqa: E402


ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _generate_plain_code(prefix: str) -> str:
    parts = ["".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3)]
    return f"{prefix}-" + "-".join(parts)


async def _insert_cards(
    *,
    count: int,
    credits: int,
    card_type: str,
    prefix: str,
    expires_days: int | None,
) -> list[str]:
    codes: list[str] = []
    expires_at = None
    if expires_days is not None:
        expires_at = datetime.now(timezone.utc) + timedelta(days=expires_days)

    seen_hashes: set[str] = set()
    while len(codes) < count:
        plain = _generate_plain_code(prefix)
        code_hash = sha256_hex(plain)
        if code_hash in seen_hashes:
            continue
        seen_hashes.add(code_hash)
        codes.append(plain)

    async with SessionLocal() as db:
        for plain in codes:
            db.add(
                CardCode(
                    code_hash=sha256_hex(plain),
                    credits=credits,
                    card_type=card_type,
                    status="unused",
                    expires_at=expires_at,
                )
            )
        await db.flush()
        await db.commit()
    return codes


def _write_csv(path: Path, *, codes: list[str], credits: int, card_type: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["code", "credits", "card_type"])
        for code in codes:
            writer.writerow([code, credits, card_type])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Toolii card codes and store only SHA-256 hashes in DB.")
    parser.add_argument("--count", type=int, required=True, help="Number of card codes to generate")
    parser.add_argument("--credits", type=int, required=True, help="Credits value for each card")
    parser.add_argument("--card-type", type=str, default="standard", help="Card type label")
    parser.add_argument("--prefix", type=str, default="TOOL", help="Code prefix (default: TOOL)")
    parser.add_argument("--expires-days", type=int, default=None, help="Optional expiration in days")
    parser.add_argument(
        "--csv",
        type=Path,
        default=ROOT / "generated-cards.csv",
        help="Output CSV file path for plaintext codes",
    )
    return parser.parse_args()


def _validate_args(args: argparse.Namespace) -> None:
    if args.count <= 0:
        raise SystemExit("--count must be > 0")
    if args.credits <= 0:
        raise SystemExit("--credits must be > 0")
    if args.expires_days is not None and args.expires_days <= 0:
        raise SystemExit("--expires-days must be > 0")
    prefix = str(args.prefix or "").strip().upper()
    if not prefix or any(ch not in string.ascii_uppercase + string.digits for ch in prefix):
        raise SystemExit("--prefix must be alphanumeric")
    args.prefix = prefix


def main() -> None:
    args = parse_args()
    _validate_args(args)

    codes = asyncio.run(
        _insert_cards(
            count=args.count,
            credits=args.credits,
            card_type=args.card_type,
            prefix=args.prefix,
            expires_days=args.expires_days,
        )
    )
    _write_csv(args.csv, codes=codes, credits=args.credits, card_type=args.card_type)

    print(f"Generated {len(codes)} card codes.")
    print(f"CSV written to: {args.csv}")
    print("Database stores only SHA-256 hashes.")


if __name__ == "__main__":
    main()
