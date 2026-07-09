"""
database.py — SQLAlchemy engine + session factory (supports SQLite and PostgreSQL).
"""
import logging
import os
import warnings

from sqlalchemy import create_engine
from sqlalchemy import exc as sa_exc
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
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=sa_exc.SAWarning)
            db.rollback()
        logger.warning("Seed skipped: %s", exc)
    finally:
        db.close()


def get_db():
    """FastAPI dependency that yields a DB session with automatic commit/rollback.

    Commits on success, rolls back on exception, and always closes the session.
    This eliminates the need for scattered ``db.commit()`` calls in route handlers.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=sa_exc.SAWarning)
            db.rollback()
        raise
    finally:
        db.close()
