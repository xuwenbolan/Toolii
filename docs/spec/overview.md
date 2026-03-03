# Toolii — Project Overview

Status: final | Updated: 2026-03-03

## Project Summary

**Project Name:** Toolii (留学生工具箱)

**One-liner:** An online tool collection for Chinese students in the UK, providing ID photo processing, image compression, file conversion and other high-frequency utility functions.

**Product Form:** Mobile-first H5 web app (responsive), accessible directly within WeChat.

**Core Concept:** Free general tools for user acquisition, premium features (ID photos) for monetization. Image/file processing is server-side. User uploads are backed up to the backend.

---

## Target Users

### Primary Users

- Chinese students in the UK (core demographic)
- Students applying for Schengen visas, renewals, and other documents
- Students with daily image/file processing needs

### User Profile

- Age 18-28
- WeChat as primary social tool
- Price-sensitive, prefer free or low-cost solutions
- Resistant to Boots photo prices (£9-12)
- Frequently encounter file size limits and format incompatibility

### User Scale Estimate

- QUB Chinese students: ~3,000-4,000
- Chinese students across the UK: ~150,000-170,000
- Students applying for Schengen visa annually: conservatively tens of thousands

---

## Success Metrics

### MVP Phase (first 2 weeks)

- Live and functional
- At least 50 trial users
- At least 10 user feedback items collected

### Growth Phase (1-3 months)

- MAU 500+
- Monthly revenue £50+
- At least one Xiaohongshu post with 100+ interactions

### Maturity Phase (3-6 months)

- MAU 2,000+
- Stable monthly revenue £100-200
- Organic traffic accounts for 50%+ of total

---

## Cost Analysis

### Fixed Costs

| Item | Cost | Notes |
|------|------|-------|
| Domain | £8-12/year | .com via Cloudflare |
| Server | varies | Self-hosted or VPS |
| SSL | £0 | Cloudflare free |
| AI models | £0 | Open-source (rembg) |

### Optional Costs

| Item | Cost | Notes |
|------|------|-------|
| Custom email | £0-5/month | Cloudflare Email free plan |
| Analytics | £0 | Google Analytics free |
| CDN | £0 | Cloudflare free CDN |

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Poor background removal quality | Medium | High | Multiple model tiers, user manual adjustment |
| Large image processing performance bottleneck | Medium | Medium | Async task queue + client-side pre-compression |
| High model loading memory usage | Medium | Medium | Lazy loading, deferred init for less-used models |

### Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Low paid conversion rate | Medium | High | Validate with tip mode first, then adjust pricing |
| Competitor imitation | Medium | Medium | Continuous iteration, build user community moat |
| Low demand outside visa season | High | Medium | General tools maintain daily traffic |

### Compliance Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Student visa self-employment issue | Low | High | Collect RMB via card-selling platform, avoid UK banking |
| User privacy / GDPR | Low | Medium | 24h file deletion, Cookie consent, biometric data not retained |

---

## Project Advantages

1. **Low startup cost** — open-source tech stack, minimal server costs
2. **Privacy assurance** — 24h auto-delete, biometric data not retained, GDPR-compliant design
3. **Precise user group** — concentrated, clear needs, easy to reach
4. **Technical barrier** — full-stack + multi-model AI capabilities difficult to replicate
5. **Passive income potential** — low daily maintenance cost, automatic revenue during visa season
6. **Extensibility** — potential to expand from toolbox to student services platform
