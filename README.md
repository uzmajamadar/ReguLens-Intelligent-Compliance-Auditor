# ReguLens AI

**AI-Powered Regulatory Compliance & Audit Intelligence Platform**

ReguLens automates compliance document review against GDPR, CCPA, and other regulatory frameworks. Upload policies, detect violations, assign review tasks, and track remediation — all in one place.

## Features

- **Document Ingestion** — Upload PDFs, auto-extract text/OCR, chunk, and embed
- **Compliance Scanning** — Detect GDPR/CCPA violations using rule-based + AI analysis
- **Review Workflow** — Submit, assign, review, approve/reject, and resolve findings
- **Notifications** — Email + Slack alerts for assignments and status changes
- **Version Control** — Track document versions with diff comparisons
- **Role-Based Access** — Admin, Compliance Manager, and Reviewer roles
- **RAG Query** — Ask natural language questions about your documents
- **Docker Ready** — Full Docker Compose setup with PostgreSQL + Qdrant

## Quick Start

### Local Development

```bash
# Backend
python -m venv venv
venv\Scripts\activate    # Windows
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

### Docker

```bash
docker compose up --build
```

Access:
- **Frontend**: http://localhost:5173
- **API Docs**: http://localhost:8000/docs
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### Default Admin Login

```
Email:    admin@regulens.ai
Password: admin123
```

## Testing

```bash
python -m pytest --tb=short
```

All 50+ tests cover authentication, review workflows, notifications, compliance scanning, uploads, and database models.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, FastAPI, SQLAlchemy, SQLite/PostgreSQL |
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| AI | Sentence Transformers (BGE-small-en-v1.5), Qdrant |
| Infrastructure | Docker, Docker Compose, Nginx |

## Deployment

### Frontend (Netlify)

```bash
cd frontend
npm run build
netlify deploy --prod --dir=dist
```

### Backend (Render / Railway)

Set environment variables:
- `DATABASE_URL` — PostgreSQL connection string
- `APP_URL` — Frontend URL (for reset-password links)
- `SMTP_*` / `RESEND_API_KEY` — Email provider
- `SLACK_WEBHOOK_URL` — Slack notifications (optional)
- `CORS_ORIGINS` — Comma-separated frontend origins
- `S3_BUCKET` — S3 bucket for file storage (optional, local disk by default)

## License

MIT
