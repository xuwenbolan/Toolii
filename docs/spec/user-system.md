# Module 4: User System

Status: draft | Updated: 2026-03-03

---

## Feature Set

| Feature | Description | Priority |
|---------|-------------|----------|
| Google OAuth login | All students have Google accounts, free integration | P0 |
| Email + password login | Traditional login, zero external dependency | P0 |
| Processing history | View operation records (source files auto-deleted after 24h, metadata only) | P1 |
| Referral sharing | Share invite link, both parties receive free credits upon registration (login required) | P2 |
| Invite code | Fill invite code at registration, complementary to invite link | P2 |
| Card code redemption | Enter card code to redeem usage credits, added to account balance (login required) | P0 |
| Balance query | View remaining credits and consumption history (login required) | P0 |
| Credits sharing | Share remaining credits with other users (login required) | P1 |

---

## Access Control Policy

| Feature Type | Login Required | Notes |
|-------------|---------------|-------|
| Image compress, format convert, HEIC convert | No | Free acquisition tools, anonymous use, rate-limited |
| PDF compress, merge, page tools | No | Free acquisition tools, anonymous use, rate-limited |
| Scan enhance, image mosaic | No | Free acquisition tools, anonymous use, rate-limited |
| ID photo processing (preview) | No | Lower entry barrier, preview has watermark |
| ID photo export (no watermark / layout) | Yes | Paid feature, login + deduct Credits |
| Processing history | Yes | Requires user identity association |
| Card code redemption | Yes | Requires user identity for balance tracking |
| Credits sharing | Yes | Both parties must be logged in |
| Referral free credits | Yes | Requires user identity association |

---

## Anti-Abuse Policy (Free Tools)

Free tools have no usage count limit, but are rate-limited by IP/user and file size cap.

| Dimension | Rule | Notes |
|-----------|------|-------|
| IP rate limit | Anonymous: max 10 requests/minute per IP | Prevent scripted batch calls |
| User rate limit | Logged-in: max 20 requests/minute per user | Slightly relaxed for logged-in users |
| Single file size | Image ≤ 20MB, PDF ≤ 50MB | Reject with prompt if exceeded |
| Batch limit | Max 20 files per batch, total ≤ 100MB | Prevent resource exhaustion |
| Concurrency limit | Max 3 concurrent tasks per IP/user | Ensure service stability |

Rate limit parameters are adjustable based on actual server load.
When rate-limited, return HTTP 429 with message "请求过于频繁，请稍后再试".
