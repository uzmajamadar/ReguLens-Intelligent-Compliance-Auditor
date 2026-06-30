"""
tests/conftest.py — Shared pytest fixtures for all ReguLens tests.
"""

import os
import tempfile

# Disable S3 for all tests — use local disk instead
os.environ["S3_BUCKET"] = ""

# Force file-based SQLite for all tests — must happen before any app imports
# Using a temp file ensures the database persists across connections (unlike :memory:)
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session

import main
from app.database import Base, get_db, engine, SessionLocal as _ProdSessionLocal
import app.models  # Ensure models register their tables with Base.metadata


# Create tables once at module level
Base.metadata.create_all(bind=engine)


# ---------------------------------------------------------------------------
# Session-scoped cleanup — delete temp database file when done
# ---------------------------------------------------------------------------
def pytest_sessionfinish(session):
    try:
        engine.dispose()
        os.unlink(_db_path)
    except OSError:
        pass


# ---------------------------------------------------------------------------
# Global lifespan disable — prevents seed_default_admin from polluting tests
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _disable_lifespan():
    """Disable the FastAPI lifespan for all tests to prevent seed_default_admin."""
    orig_lifespan = main.app.router.lifespan_context
    main.app.router.lifespan_context = None
    yield
    main.app.router.lifespan_context = orig_lifespan


# ---------------------------------------------------------------------------
# Database fixtures — savepoint-based isolation
# ---------------------------------------------------------------------------
@pytest.fixture(scope="function")
def test_db():
    """Yield a session wrapped in an outer transaction + savepoints.

    Each test gets its own connection-level transaction.  Even if the test
    calls ``commit()``, the outer transaction is rolled back at teardown,
    so no data leaks between tests.
    """
    connection = engine.connect()
    outer_trans = connection.begin()

    session = Session(bind=connection)

    # Start a savepoint so that commit() releases only the savepoint,
    # not the outer transaction.
    session.begin_nested()

    # Monkey-patch commit to start a fresh savepoint so subsequent
    # commits (e.g. in fixture setup) don't break.
    original_commit = session.commit

    def _nested_commit():
        session.flush()
        session.begin_nested()

    session.commit = _nested_commit

    try:
        yield session
    finally:
        session.close()
        connection.rollback()
        connection.close()


@pytest.fixture
def sample_pdf():
    """Return path to sample test PDF."""
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "sample.pdf")
    return fixture_path


@pytest.fixture
def sample_pdf_bytes(sample_pdf):
    """Return PDF file as bytes."""
    if not os.path.exists(sample_pdf):
        pytest.skip("sample.pdf not found. Generate with: python tests/create_test_pdf.py")

    with open(sample_pdf, "rb") as f:
        return f.read()


@pytest.fixture
def cleanup_uploads():
    """Clean up uploads folder after test."""
    yield
    uploads_dir = "uploads"
    if os.path.exists(uploads_dir):
        for f in os.listdir(uploads_dir):
            file_path = os.path.join(uploads_dir, f)
            try:
                os.remove(file_path)
            except:
                pass


@pytest.fixture
def sample_document_data(test_db):
    """Create a sample document in database for testing."""
    from app.models import Document

    doc = Document(
        id=1,
        filename="test-policy.pdf",
        original_filename="test-policy.pdf",
        file_size_bytes=1024,
        page_count=5,
        status="indexed",
    )
    test_db.add(doc)
    test_db.commit()
    return doc


# ---------------------------------------------------------------------------
# Shared authenticated client fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def unauth_client(test_db):
    """TestClient with test database but NO authenticated user override."""
    from app.auth import get_current_user

    def override_get_db():
        yield test_db

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides.pop(get_current_user, None)

    yield TestClient(main.app)

    main.app.dependency_overrides.clear()


@pytest.fixture
def auth_client(test_db):
    """TestClient with test database and authenticated admin user."""
    from app.auth import get_current_user, hash_password, create_access_token
    from app.models import Organization, User

    org = test_db.query(Organization).first()
    if not org:
        org = Organization(name="Test Org")
        test_db.add(org)
        test_db.flush()

    user = test_db.query(User).filter(User.email == "testadmin@test.com").first()
    if not user:
        user = User(
            name="Test Admin",
            email="testadmin@test.com",
            password_hash=hash_password("test123"),
            role="admin",
            organization_id=org.id,
        )
        test_db.add(user)
        test_db.flush()

    token = create_access_token({"sub": str(user.id), "role": user.role})

    def override_get_db():
        yield test_db

    def override_get_current_user():
        return user

    main.app.dependency_overrides[get_db] = override_get_db
    main.app.dependency_overrides[get_current_user] = override_get_current_user
    client = TestClient(main.app)
    client.headers["Authorization"] = f"Bearer {token}"
    yield client
    main.app.dependency_overrides.clear()


# Keep original 'client' fixture as alias for backward compat (test_api_upload)
@pytest.fixture
def client(auth_client):
    yield auth_client
