# Module 6: Visa Materials Full-Service Workflow (¥88/session)

Status: draft | Updated: 2026-03-03

Upgrade from tool to service: ¥88 one-time price for guided visa materials preparation.
User follows the flow once, all materials are ready.

---

## Service Scope

| Included | Not Included |
|----------|-------------|
| Materials checklist (customized by visa type) | Filling visa application forms |
| ID photo processing (target country standards) | Booking visa center appointments |
| Document format processing (scan enhance, compress, format convert) | Visa consulting / legal advice |
| Materials check (completeness, date consistency, validity period) | Submitting materials on behalf |
| Auto-generate itinerary and Cover Letter | Translation services (templates provided, no translation) |
| Materials packaging (auto naming and ordering) | |
| Cloud storage (30 days download anytime) | |

Page must clearly state: "Materials checklist is for reference only; please refer to the official requirements of the visa center" with official link.

---

## Complete Service Flow (7 Steps)

| Step | Feature | Description | Priority |
|------|---------|-------------|----------|
| Step 1: Select visa type | Scenario selection | Choose visa country + type + enter travel date range | P0 |
| Step 2: Materials checklist + smart reminders | Customized checklist | Generate required materials list by visa type, checkable items | P0 |
| | Document validity check | Remind passport must exceed travel dates by 3-6 months, bank statements within 1-3 months, etc. | P0 |
| | Bank balance reminder | Calculate recommended minimum balance by travel days (Schengen ~€50-100/day) | P0 |
| | Travel insurance reminder | Remind insurance coverage amount requirement (Schengen ≥ €30,000) and date coverage | P0 |
| Step 3: Upload + auto-process per item | ID photo processing | Call ID photo module, process by target country standards, output both print and digital versions | P0 |
| | Scan enhance | Auto-crop, perspective correction, shadow removal, B&W | P0 |
| | PDF format processing | Compress to visa-required size, format convert | P0 |
| | Privacy info redaction | Bank statement account numbers, unnecessary transaction details, etc. | P1 |
| Step 4: Smart check | Completeness check | Mark missing items against checklist | P0 |
| | Date consistency check | Check hotel/flight/itinerary/insurance dates match | P0 |
| | File spec check | Size, format, clarity, file size compliance | P0 |
| | Validity period check | Passport validity, bank statement timeliness, enrollment certificate validity, etc. | P0 |
| Step 5: Auto-generate | Itinerary PDF | User inputs destinations, hotels, activities -> generate standard format itinerary | P0 |
| | Cover Letter PDF | User inputs travel info -> generate standard English visa cover letter | P1 |
| Step 6: Package output | Auto naming + ordering | Rename per visa center convention (e.g. `01_Passport.pdf`, `02_Photo.pdf`), correct order | P0 |
| | Merge PDF | Merge all materials into one complete PDF (optional) | P0 |
| | Zip download | Download all processed files as zip package | P0 |
| Step 7: Cloud storage | 30-day storage | Visa package user materials retained 30 days (normal users 24h), view/download anytime | P0 |

---

## Date Consistency Check

Initial lightweight approach: User enters travel date range in Step 1.
System prompts user to manually confirm date matching when uploading hotel/flight/insurance.

```
User enters travel dates: 2025-07-10 ~ 2025-07-17
  -> Upload hotel confirmation: "Please confirm hotel check-in dates cover July 10-17"
  -> Upload flight tickets: "Please confirm flight dates are July 10 departure, July 17 return"
  -> Upload insurance: "Please confirm insurance covers entire trip July 10-17"
  -> Generate itinerary: Automatically use user-input date range
```

Future iteration: OCR/AI auto-extract dates for comparison.

---

## Itinerary Generation

| Field | User Input | Auto Processing |
|-------|-----------|----------------|
| Travel dates | Carried from Step 1 | Auto-fill daily dates |
| Destination cities | Manual input (multi-city) | Arrange by date |
| Transportation | Select (plane/train/bus etc.) | Fill transport column |
| Hotel name | Manual input | Fill accommodation column |
| Main activities | Manual input or select presets (sightseeing, shopping etc.) | Fill activity column |
| Output format | — | Standard table PDF with applicant info header |

Pre-set popular itinerary templates (e.g. "Paris 5 days", "Italy 7 days") for quick fill.

---

## Cover Letter Generation

Template-based fill for standard English visa cover letter. User inputs:

- Applicant name, passport number
- Destination country, cities
- Travel purpose (tourism/business/family visit)
- Travel dates
- Accommodation arrangement summary
- Source of funding

System generates formal English letter PDF in visa application convention format.

---

## Initially Supported Visa Types

| Visa Type | Target Users | Priority |
|-----------|-------------|----------|
| Schengen tourism (France/Italy/Spain/Germany etc.) | UK students short trips | P0 |
| UK student visa renewal (Tier 4 / Student Visa) | Renewal students | P0 |
| US B1/B2 tourist visa | US trip/interview | P1 |
| Japan tourist visa | Short trip | P1 |
| Ireland tourist visa | Short trip | P2 |

Start with Schengen tourism and UK renewal (highest frequency), validate flow, then expand.
Materials checklists use manually maintained structured data (JSON config files), ensuring accuracy without depending on AI search.

---

## Technical Implementation

| Point | Approach |
|-------|----------|
| Materials checklist data | JSON config files, maintained per visa type, manually reviewed and updated |
| Itinerary generation | Jinja2 template + reportlab/weasyprint PDF output |
| Cover Letter generation | Jinja2 template fill + PDF output |
| Date check | Frontend interactive confirmation (initial), OCR auto-extract (future) |
| File naming/ordering | Backend auto-rename per visa-type configured rules |
| Cloud storage | Reuse existing file storage, visa package user file retention set to 30 days |
| Payment verification | Verify purchase when entering visa flow (consume Credits), redirect to payment if not purchased |
