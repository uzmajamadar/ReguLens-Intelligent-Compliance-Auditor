# ReguLens AI

🚀 *AI-Powered Regulatory Compliance & Audit Intelligence Platform*

---

## Overview

**ReguLens AI** automates compliance document review against major regulatory frameworks. Upload policies, detect violations, assign review tasks, and track remediation — all in one unified platform.

## Why ReguLens?

Manual compliance review is slow, expensive, and error-prone. ReguLens brings AI-powered automation to the compliance workflow while keeping humans in the loop for critical decisions.

- **Fast** — reduce review time from weeks to hours
- **Multi-Framework** — GDPR, HIPAA, SOC 2, PCI DSS, ISO 27001, CCPA
- **AI-Powered** — rule evaluation via Groq LLM with semantic vector search
- **Human-in-the-Loop** — review queue with task assignment and audit trail

---

## ✨ Features

- **Document Ingestion** — Upload PDFs, auto-extract text, OCR fallback, chunk, and embed
- **Compliance Scanning** — AI-powered rule evaluation with severity grading (A–F)
- **Review Workflow** — Customizable steps, role-based assignment, round-robin distribution
- **Remediation Copilot** — AI-generated fix suggestions with before/after comparison
- **RAG Document Query** — Ask natural language questions about your documents
- **Version Control** — Track revisions with cross-version diff comparison
- **Notifications** — Email (SMTP/Resend/SendGrid) + Slack with per-framework routing
- **Role-Based Access** — Admin, Compliance Manager, Reviewer, Document Owner
- **Audit Trail** — Immutable event logging for every state transition

---

## 📸 Screenshots

| Page | Preview |
|------|---------|
| **Dashboard** | *Coming soon* |
| **Documents** | *Coming soon* |
| **Compliance Scan** | *Coming soon* |
| **Review Queue** | *Coming soon* |
| **Auditor AI (RAG Chat)** | *Coming soon* |

---

## Technical Stack

| Component | Technology |
|-----------|-----------|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, Radix UI, TanStack Query |
| **Backend** | Python 3.11, FastAPI, SQLAlchemy 2.0, Alembic |
| **Database** | PostgreSQL 16 (prod) / SQLite (dev) |
| **Vector Store** | Qdrant (HNSW index, 384-dim) |
| **Embeddings** | HuggingFace BAAI/bge-small-en-v1.5 |
| **LLM** | Groq (Llama-3, Mixtral, DeepSeek) |
| **Auth** | JWT (HS256) + bcrypt |
| **OCR** | Tesseract via PyMuPDF |
| **File Storage** | Local filesystem or S3-compatible |
| **Notifications** | SMTP email, Slack webhooks |

---

## System Architecture

```
User (Browser)
    │
    ▼
React SPA ──HTTP /api/*──► FastAPI Server
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              PostgreSQL    Qdrant       Groq API
              (users,      (vector      (LLM rule
               docs,        embeddings)  evaluation)
               violations)
                    │
                    ▼
              Email / Slack
              (notifications)
```

**How it works:**
1. Upload a PDF → text extraction → OCR if needed → chunking → embedding → stored in Qdrant
2. Select frameworks → compliance engine retrieves relevant chunks → Groq evaluates each rule
3. Violations get severity scores → workflow instances created → tasks assigned by role
4. Reviewers inspect findings → accept/dismiss → remediation suggestions generated
5. All actions logged + notified via email/Slack/in-app

---

# Setup & Installation

### Prerequisites
- Python 3.11+
- Node.js 20+
- Tesseract OCR
- Groq API key ([free tier](https://console.groq.com))

### Local Development

```bash
# Clone
git clone https://github.com/uzmajamadar/ReguLens-Intelligent-Compliance-Auditor.git
cd regulens

# Backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt

# Environment
cp .env.example .env       # Edit with your keys

# Run backend
uvicorn main:app --reload

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```


### Access

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API Docs | http://localhost:8000/docs |
| Qdrant UI | http://localhost:6333/dashboard |

### Default Admin

| Email | Password |
|-------|----------|
| admin@regulens.ai | admin123 |

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `JWT_SECRET` | JWT signing secret | Yes |
| `DATABASE_URL` | PostgreSQL connection string | No |
| `GROQ_API_KEY` | Groq API key for LLM | Yes |
| `QDRANT_URL` | Qdrant server URL | No |
| `QDRANT_API_KEY` | Qdrant cloud API key | No |
| `COLLECTION_NAME` | Qdrant collection name | No |
| `APP_URL` | Frontend URL | Yes |
| `SMTP_HOST` | SMTP server | No |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials | No |
| `SLACK_WEBHOOK_URL` | Default Slack webhook | No |

---

## API Overview

All endpoints except `/auth/login` and `/auth/register` require a Bearer token.

```bash
# Login
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@regulens.ai", "password": "admin123"}'

# Upload document
curl -X POST http://localhost:8000/upload/ \
  -H "Authorization: Bearer <token>" \
  -F "file=@policy.pdf" \
  -F "frameworks=GDPR,CCPA"

# Run audit
curl -X POST http://localhost:8000/audits/scan/1 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"framework": "GDPR"}'
```

Interactive docs at `/docs` (Swagger) and `/redoc` (ReDoc).

---

## Core Metrics

| Metric | Value |
|--------|-------|
| **Supported Frameworks** | 6 (GDPR, CCPA, HIPAA, SOC 2, PCI DSS, ISO 27001) |
| **Rule Count** | 100+ compliance rules |
| **Embedding Dims** | 384 (bge-small-en-v1.5) |
| **Chunk Size** | 500 tokens (50 overlap) |
| **Scoring Range** | A (90+) to F |
| **Auth** | JWT + bcrypt + RBAC |
| **Database Migrations** | Alembic |

---

## 🚀 Future Enhancements

- Real-time notifications via WebSocket
- PDF report export with branded templates
- Custom rule builder UI
- SSO/SAML integration
- Bulk document upload
- Scheduled recurring scans
- CI/CD pipeline with GitHub Actions
- Internationalization (i18n)

---

## 🤝 Contributions Welcome

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## License

MIT — see `LICENSE` for details.

---

## Author

**Uzma Jamadar**
