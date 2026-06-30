"""
database.py — SQLAlchemy engine + session factory (supports SQLite and PostgreSQL).
"""
import logging
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./regulens.db")
IS_SQLITE = DATABASE_URL.startswith("sqlite")

connect_args = {"check_same_thread": False} if IS_SQLITE else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def run_sqlite_migrations():
    """Add columns that may not exist in older SQLite databases (dev only)."""
    if not IS_SQLITE:
        logger.info("Skipping SQLite-specific migrations — using PostgreSQL.")
        return
    with engine.connect() as conn:
        table_result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        existing_tables = {row[0] for row in table_result.fetchall()}

        def _ensure_column(table, col, col_type):
            if table not in existing_tables:
                return
            result = conn.execute(text(f"PRAGMA table_info({table})"))
            existing_cols = {row[1] for row in result.fetchall()}
            if col not in existing_cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                logger.info("Migration: added %s.%s (%s)", table, col, col_type)

        _ensure_column("violations", "confidence", "INTEGER")
        _ensure_column("violations", "source_chunks", "TEXT")
        _ensure_column("violations", "page_number", "INTEGER")
        _ensure_column("documents", "user_id", "INTEGER")
        _ensure_column("documents", "organization_id", "INTEGER")
        _ensure_column("documents", "file_path", "VARCHAR(512)")
        _ensure_column("documents", "frameworks", "TEXT")
        _ensure_column("conversations", "user_id", "INTEGER")
        _ensure_column("review_tasks", "assigned_to_id", "INTEGER")

        conn.commit()


def seed_default_admin():
    """Create default admin user + org if no users exist."""
    from app.models import Organization, User
    from app.auth import hash_password

    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return

        org = Organization(name="Default Organization")
        db.add(org)
        db.flush()

        admin = User(
            name="Admin",
            email="admin@regulens.ai",
            password_hash=hash_password("admin123"),
            role="admin",
            organization_id=org.id,
        )
        db.add(admin)
        db.flush()

        # Reassign unowned documents to default admin's org
        from app.models import Document
        db.query(Document).filter(Document.organization_id.is_(None)).update(
            {"user_id": admin.id, "organization_id": org.id}
        )

        db.commit()
        logger.info("Seeded default admin (admin@regulens.ai / admin123) and org '%s'", org.name)

        # Seed default workflows for this org
        from app.workflow_engine import seed_default_workflows
        seed_default_workflows(db, org.id)
        logger.info("Seeded default workflows for org '%s'", org.name)

    except Exception as exc:
        db.rollback()
        logger.warning("Seed skipped: %s", exc)
    finally:
        db.close()


def get_db():
    """FastAPI dependency that yields a DB session and closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
