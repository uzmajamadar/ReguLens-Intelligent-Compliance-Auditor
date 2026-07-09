"""
main.py — FastAPI application entry point for ReguLens AI.

Run with:
    uvicorn main:app --reload
"""
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from alembic.config import Config as AlembicConfig
from alembic import command
from app.database import seed_default_admin
from app.routers import admin, auth, audits, compliance, groq, notifications, query, remediations, reviews, upload, versions, violations, workflows

# ---------------------------------------------------------------------------
# Load environment variables from .env
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: create DB tables on startup
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting ReguLens AI — applying Alembic migrations…")
    alembic_cfg = AlembicConfig("alembic.ini")
    command.upgrade(alembic_cfg, "head")
    seed_default_admin()
    logger.info("Database ready.")
    yield
    logger.info("ReguLens AI shutting down.")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="ReguLens AI",
    description=(
        "AI-Powered Regulatory Compliance & Audit Intelligence Platform — "
        "upload PDFs, extract text/OCR, chunk, embed, and query with RAG."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# CORS — allow origins from env (comma-separated, "*" allows all)
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(workflows.router)
app.include_router(upload.router)
app.include_router(query.router)
app.include_router(audits.router)
app.include_router(compliance.router)
app.include_router(reviews.router)
app.include_router(violations.router)
app.include_router(remediations.router)
app.include_router(versions.router)
app.include_router(groq.router)
app.include_router(notifications.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "regulens-ai"}
