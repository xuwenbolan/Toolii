# Module 4: User System

Status: draft | Updated: 2026-03-06

---

## Role & Permission Model

Single `role` field on User model, three values with hierarchy: `superadmin > admin > user`.

| Role | `role` value | Description |
|------|-------------|-------------|
| User | `user` (default) | Normal registered user |
| Admin | `admin` | Operations staff, permissions controlled by superadmin |
| Superadmin | `superadmin` | Site owner / root, full control, bypasses all permission checks |

Replaces the old `is_admin` boolean field.

### Superadmin

- Bypasses all permission checks unconditionally
- Can grant/revoke admin role for any user
- Can configure which permissions each admin has
- Cannot be disabled or demoted through the admin UI
- Not created via UI — set directly in database or via CLI command

### Admin Permissions

Admins have an `admin_permissions` JSON field storing a list of permission keys.
Superadmin assigns permissions when granting admin role.

| Permission Key | Scope |
|----------------|-------|
| `dashboard` | View dashboard statistics |
| `users` | View, disable/enable users, adjust credits |
| `cards` | Generate and disable card codes |
| `operations` | View tool usage, transactions, revenue, audit logs |
| `storage` | Browse files, delete transfers/shares, storage cleanup |

Expansion: add a new key, add `require_permission("key")` to routes. Existing admins without the new key are denied by default (secure default).

### Permission Enforcement

- `require_admin` — requires `role in (admin, superadmin)`
- `require_superadmin` — requires `role == superadmin`
- `require_permission(key)` — superadmin: pass; admin: check `key in admin_permissions`

### Role Capability Matrix

| Action | User | Admin | Superadmin |
|--------|------|-------|------------|
| Use tools | Yes | Yes | Yes |
| Access admin panel | No | Yes | Yes |
| Manage users (disable, adjust credits) | No | Needs `users` | Yes |
| Generate card codes | No | Needs `cards` | Yes |
| Delete data (transfers, shares) | No | Needs `storage` | Yes |
| Storage cleanup | No | Needs `storage` | Yes |
| Grant/revoke admin | No | No | Yes |
| Modify admin permissions | No | No | Yes |
| Disable another admin | No | No | Yes |

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
