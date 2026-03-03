# Data & Compliance

Status: draft | Updated: 2026-03-03

> Product design and engineering implementation guidance. Not legal advice.
> Review privacy statement wording before official launch.

---

## Data Types Processed

| Data Category | Content | Source |
|--------------|---------|--------|
| User uploaded files | Images (JPG/PNG/HEIC/WEBP), PDF documents | User upload |
| Processed result files | Compressed images, background-replaced ID photos, merged PDFs, etc. | Server-side processing |
| Account info | Email address, OAuth identifier (Google sub), password hash | Registration/login |
| Credits data | Credits balance, redemption records, consumption records, sharing records | Business flow |
| Basic logs | IP address, User-Agent, request time, request path | Server auto-collection (minimized) |
| Analytics data | Page views, feature usage events | Google Analytics (requires user consent) |

---

## Usage and Legal Basis

| Usage | Data | Legal Basis (UK GDPR) |
|-------|------|----------------------|
| Provide tool service (upload -> process -> download) | Uploaded files, result files | Contract performance (Article 6(1)(b)) |
| Account & credits management (register, login, Credits) | Account info, credits data | Contract performance (Article 6(1)(b)) |
| Security risk control (anti-abuse, anomaly detection, audit) | Basic logs, operation records | Legitimate interest (Article 6(1)(f)) |
| Data analytics (Google Analytics) | Analytics data | Consent (Article 6(1)(a)) |

---

## Data Retention Policy

| Data Category | Retention Period | Deletion Method |
|--------------|-----------------|----------------|
| Uploaded files (original + result, normal users) | **24 hours** after processing | Background scheduled task hourly scan, permanently delete expired files |
| Visa package user material files | **30 days** after purchase | Extended retention for visa package users, auto-delete after 30 days; user can manually delete earlier |
| Operation records (metadata) | Account lifetime | Keep only operation time, feature type, filename metadata; source files cannot be re-downloaded after deletion |
| Account info | Account lifetime | User can request account deletion; all associated data cleared within 30 days of deletion |
| Credits data (transaction log) | Account lifetime | Deleted with account deletion |
| Basic logs | **90 days** | Periodic rotation cleanup |
| GA analytics data | Per Google Analytics retention settings | Recommend 14 months (GA shortest option) |

---

## Biometric Data Processing Statement

ID photo processing involves face detection (MediaPipe Face Detection / Face Mesh):

**Usage strictly limited:**
- Face detection used ONLY for **compliance check** (frontal face, closed eyes, open mouth etc.) and **crop positioning** (head proportion, eye position)
- **NOT used** for identity recognition, face comparison, face search, or any identity-related purpose

**No derived biometric data retained:**
- Face landmark coordinates, Face Mesh data, embedding vectors generated during processing **exist only in memory**, released immediately after processing
- Database and file system **do not store** any face landmarks, feature vectors, or derived biometric data
- Only save final processed ID photo image and necessary processing metadata (size, background color, compliance check result pass/fail)

**Privacy statement must clearly state:**
- Inform users that ID photo processing uses face detection technology
- Explain processing purpose and the fact that data is not retained

---

## Security Measures

| Layer | Requirement | Implementation |
|-------|------------|----------------|
| Transport security | Full-site HTTPS, no HTTP plaintext | Cloudflare SSL + HSTS header |
| Storage permissions | Upload directory minimal permissions, only app process can read/write | Linux file permissions `700`, dedicated run user |
| Download auth | Download links require auth or short-term signature, no guessable URLs | Signed temporary URL (HMAC + expiry) or login state verification |
| Card code storage | Card codes not stored in plaintext | Store `hash(code)`, verify by hash comparison at redemption |
| Password storage | User passwords not stored in plaintext | bcrypt/argon2 hash + salt |
| Operation audit | Redemption and consumption records auditable | credit_transactions table records all changes with timestamps and related IDs |
| Log minimization | Logs do not record full request bodies | Log only IP, UA, path, status code, duration; uploaded file content not in logs |
| CORS policy | API allows only own frontend domain | FastAPI CORS whitelist configuration |
| Rate limiting | IP/user-level rate limiting | FastAPI middleware or slowapi; see user-system.md anti-abuse policy |
| File size limits | Single file upload cap (Image 20MB / PDF 50MB) | Frontend pre-validation + backend double-check |

---

## Cookie Consent Management

### Cookie Banner Behavior

```
First visit
  -> Bottom/center page Cookie Banner popup
  -> Three buttons: [Accept analytics] [Reject] [Manage]
  -> Manage expands details:
      - Essential cookies (always on, cannot disable): session management, CSRF token
      - Analytics cookies (default off): Google Analytics
  -> User choice recorded to localStorage

Loading logic
  -> Load GA script ONLY after user clicks Accept or enables analytics in Manage
  -> Reject or no action -> no third-party analytics scripts loaded

Revocation entry
  -> Footer always shows "Cookie Settings" link
  -> Click reopens Cookie Banner, allowing user to change preferences anytime
```
