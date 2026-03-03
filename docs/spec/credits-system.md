# Module 5: Credits & Card Code System

Status: draft | Updated: 2026-03-03

Core monetization infrastructure.

---

## Card Code Pricing

| Card Type | Price | Credits | Unit Price | Notes |
|-----------|-------|---------|------------|-------|
| Single | ¥8 | 1 | ¥8/credit | Not recommended, steer users to double card |
| Double | ¥10 | 2 | ¥5/credit | Primary product, best value |
| Five-pack | ¥20 | 5 | ¥4/credit | High-frequency users / group buy (future) |

Strategy: Price single card high (¥8) to steer users toward ¥10 double card, increase ARPU.

---

## Card Code Generation & Distribution

| Step | Approach | Notes |
|------|----------|-------|
| Format | `TOOL-XXXX-XXXX-XXXX` (16 uppercase alphanumeric) | Easy to read and type |
| Generation | Admin tool batch generation | Specify type and quantity, batch generate and export |
| Distribution | Third-party auto card-selling platform | User pays -> platform auto-sends card code |
| Anti-fraud | One-time use + bound to redeeming user | Mark as used, record user and timestamp |

### Distribution Flow

```
User pays on card-selling platform
  -> Platform auto-sends card code to user email/page
  -> User copies card code to Toolii website to redeem
  -> System validates card code
  -> Credits added to user account
```

Card-selling platform only handles sale and delivery. Toolii handles validation and credit topup. Decoupled — Toolii does not integrate payment APIs.

---

## Redemption Flow (User Perspective)

```
User clicks "Redeem Card Code" (must be logged in, redirect to login if not)
  -> Enter code (TOOL-XXXX-XXXX-XXXX)
  -> Frontend submits to POST /api/credits/redeem
  -> Backend: SHA-256(input code) -> lookup hash in DB -> verify status (unused) and expiry
  -> Success: Update card status to redeemed, write credit_transactions, increase user balance
  -> Frontend shows result: "Successfully topped up 2 Credits, current balance 5 Credits"
  -> Failure: Show "Code invalid / already used / expired"
```

---

## Payment API Direct Top-up (Reserved, Not Implemented Yet)

```
User clicks "Buy Credits" (must be logged in)
  -> Select tier (e.g. 2 Credits / ¥10, 5 Credits / ¥20)
  -> Frontend calls POST /api/credits/purchase to create payment order
  -> Backend generates order record (status=pending), returns payment params
  -> User completes third-party payment (WeChat Pay / Alipay / Stripe)
  -> Payment callback -> Backend verifies signature -> Update order to paid
  -> Write credit_transactions (type=purchase), increase user balance
  -> Frontend polls or WebSocket for confirmation
```

Payment top-up and card redemption share the same Credits balance system and transaction table, differing only by `type` field (`recharge` vs `purchase`).

---

## Paid Feature Deduction Flow

```
User clicks "Download without watermark" or "6x4 layout export" on ID photo result page
  -> Check login state (redirect to login if not)
  -> Check balance >= required Credits (insufficient -> prompt to top up, show redemption and purchase entries)
  -> Deduct Credits, write credit_transactions (type=consume, description records feature name)
  -> Generate signed temporary download link, complete download
```

---

## Credits Consumption Rules

| Paid Feature | Credits Cost | Notes |
|-------------|-------------|-------|
| ID photo watermark-free HD download | 1 | Single final photo download |
| ID photo 6x4 layout export | 1 | Generate Boots printable layout |
| Batch processing zip export | 1 | One batch task (regardless of file count) |
| Visa materials full-service | Independent ¥88 | Separate from Credits system, one-time purchase |

Free tools (image compress, format convert, PDF processing, etc.) do not consume Credits.

---

## Credits Transaction Types

| Type | Direction | Trigger |
|------|-----------|---------|
| `recharge` | +N | User redeems card code |
| `purchase` | +N | Direct payment top-up (reserved) |
| `consume` | -N | Use paid feature |
| `share_out` | -N | Create share link (frozen/deducted) |
| `share_in` | +N | Recipient claims share link |
| `share_refund` | +N | Share link expired unclaimed, auto-refund |

**Constraints:**
- Credits balance cannot go negative; insufficient balance rejects operation with top-up prompt
- All changes logged in `credit_transactions` table with post-change balance snapshot for audit

---

## Credits Sharing Feature

Users can share remaining Credits to other users (including unregistered users) via link.

### Sharing Flow (Freeze-on-create Model)

```
Sharer clicks "Share Credits"
  -> Select amount (e.g. 1 Credit)
  -> Verify balance >= share amount
  -> Immediately deduct from sharer balance (freeze), write credit_transactions (type=share_out)
  -> Generate one-time share link (unique token), valid for 24 hours
  -> Sharer copies link to send to friends (WeChat / social platforms)

Recipient clicks link
  -> Logged in: Credits arrive immediately, write credit_transactions (type=share_in)
  -> Not logged in but has account: Redirect to login, auto-credit after login
  -> Not registered: Redirect to registration, auto-credit after registration (new user acquisition)
  -> Link status updated to claimed, recipient user ID recorded

Link expires unclaimed
  -> Background scheduled task scans expired pending links
  -> Auto-refund Credits to sharer balance, write credit_transactions (type=share_refund)
  -> Link status updated to expired
```

### Sharing Rules

| Rule | Details |
|------|---------|
| Minimum share unit | 1 Credit |
| Max per share | Cannot exceed current available balance |
| Link validity | 24 hours, auto-refund on expiry |
| Claim limit | Each link claimable once, cannot claim own link |
| Active link cap | Max 10 unclaimed active share links per user (anti-abuse) |

---

## Database Models

```
card_codes
├── id              PK
├── code_hash       SHA-256 hash of card code (unique index, no plaintext stored)
├── card_type       Card type (single/double/five)
├── credits         Included credits count
├── status          Status (unused/redeemed/expired)
├── redeemed_by     Redeeming user ID (FK)
├── redeemed_at     Redemption timestamp
├── created_at      Creation timestamp
├── expires_at      Expiry time (default 1 year from creation)
└── batch_id        Batch ID (for management)

user_credits
├── id              PK
├── user_id         User ID (FK, unique)
├── balance         Current balance (remaining credits)
└── updated_at      Last update timestamp

credit_transactions
├── id              PK
├── user_id         User ID (FK)
├── type            Type (recharge/purchase/consume/share_out/share_in/share_refund)
├── amount          Change amount (positive=increase, negative=decrease)
├── balance_after   Post-change balance
├── description     Description (e.g. "Redeem double card" / "ID photo download" / "Share to user xxx")
├── related_id      Related ID (card code ID / share link ID / payment order ID)
└── created_at      Timestamp

share_links
├── id              PK
├── from_user_id    Sharer user ID (FK)
├── to_user_id      Recipient user ID (FK, filled after claim)
├── credits         Shared credits count
├── token           Link token (unique)
├── status          Status (pending/claimed/expired)
├── created_at      Creation timestamp
└── expires_at      Expiry time (24 hours)
```

---

## Card Code Security Spec

| Attribute | Specification |
|-----------|---------------|
| Format | `TOOL-XXXX-XXXX-XXXX` (16 uppercase letters + digits, grouped for readability) |
| Denominations | Configurable: +1 / +2 / +5 / +10 Credits |
| Validity | Configurable expiry (default 1 year), cannot redeem after expiry |
| Usage limit | One-time use, invalidated immediately after redemption |
| Storage | DB stores `SHA-256(code)` only, no plaintext; redeem by hash comparison |
| Generation flow | Admin generates plaintext -> export CSV/TXT (for card platform) -> DB writes hash only |
| Batch management | Each generation run has batch_id for per-batch query and invalidation |
