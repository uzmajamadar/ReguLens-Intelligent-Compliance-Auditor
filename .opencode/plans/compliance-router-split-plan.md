# Compliance Router Split Plan

## Goal
Split the monolithic `app/routers/compliance.py` (1574 lines) into four focused domain files, keeping a slim `compliance.py` for feedback + rules only.

## Why
Reduces merge conflicts, clarifies ownership, and keeps each file under 400 lines.

## Before vs After

### Before: `compliance.py` (1574 lines)
- Audit execution (`POST /audit`, `GET /frameworks`)
- Review queue CRUD (10 endpoints)
- Violation management (list, status, assign, submit-review)
- Remediation copilot (generate, accept/reject, edit, apply)
- Feedback (submit, list)
- Rules (list)

### After: 5 files, all under `/compliance` prefix

| File | Lines | Responsibility |
|------|-------|---------------|
| `app/routers/audits.py` | 183 | `POST /audit`, `GET /frameworks` |
| `app/routers/reviews.py` | 365 | Review queue CRUD (10 endpoints) |
| `app/routers/violations.py` | 258 | Violation list, status, assign, submit-review |
| `app/routers/remediations.py` | 340 | Remediation copilot (6 endpoints) |
| `app/routers/compliance.py` | 123 | Feedback + rules (3 endpoints) |

## No URL Changes
All endpoints still start with `/compliance/` — zero frontend changes needed.

| Old Path | New File | Still Works? |
|----------|----------|-------------|
| `POST /compliance/audit` | `audits.py` | ✅ |
| `GET /compliance/frameworks` | `audits.py` | ✅ |
| `GET /compliance/review` | `reviews.py` | ✅ |
| `GET /compliance/review/stats` | `reviews.py` | ✅ |
| `POST /compliance/review/{id}/approve` | `reviews.py` | ✅ |
| ...all 10 review endpoints | `reviews.py` | ✅ |
| `GET /compliance/violations` | `violations.py` | ✅ |
| `PATCH /compliance/violations/{id}/status` | `violations.py` | ✅ |
| `PATCH /compliance/violations/{id}/assign` | `violations.py` | ✅ |
| `POST /compliance/violations/{id}/submit-review` | `violations.py` | ✅ |
| `POST /compliance/remediate/{id}` | `remediations.py` | ✅ |
| `POST /compliance/remediation/{id}/accept` | `remediations.py` | ✅ |
| `POST /compliance/remediation/{id}/reject` | `remediations.py` | ✅ |
| `POST /compliance/remediation/{id}/edit` | `remediations.py` | ✅ |
| `POST /compliance/remediation/{id}/apply` | `remediations.py` | ✅ |
| `GET /compliance/violations/{id}/remediations` | `remediations.py` | ✅ |
| `POST /compliance/feedback` | `compliance.py` | ✅ |
| `GET /compliance/feedback/{name}` | `compliance.py` | ✅ |
| `GET /compliance/rules` | `compliance.py` | ✅ |

## main.py Changes
Added 4 new imports and 4 new `include_router` calls:
```
from app.routers import ... audits, ... remediations, reviews, ... violations, ...

app.include_router(audits.router)
app.include_router(reviews.router)
app.include_router(violations.router)
app.include_router(remediations.router)
```

## Verification
- All imports pass (`python -c "from app.routers import audits, reviews, violations, remediations, compliance"`)
- All 24 endpoints enumerated and match original paths
- Frontend API calls (`${BASE}/compliance/...`) unaffected
