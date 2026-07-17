"""ReguLens AI — Automated Test Suite

Comprehensive testing pipeline for the ReguLens AI compliance platform.

Test Structure
--------------
tests/
  conftest.py                  Shared fixtures (DB isolation, auth clients, mocks)
  unit/                        Unit tests — no HTTP, pure logic
    test_compliance_engine.py  Severity deductions, grading, audit reports, conflicts
    test_document_versioning.py  Version groups, eval status, score recalculation
    test_notifications_unit.py   Notification payload, recipients, email/Slack mocks
    test_review_workflow.py    State machine transitions, self-approval prevention
    test_rbac.py               Permission inheritance, JWT, password hashing
    test_workflow_engine.py    Condition evaluation, user rotation, severity checks
  integration/                 Integration tests — HTTP requests via TestClient
    test_api_auth.py           Login, register, profile endpoints
    test_api_documents.py      Document CRUD, scans, versions, frameworks
    test_api_compliance.py     Rules, feedback, violations, frameworks
    test_api_reviews.py        Review queue start/approve/reject/claim/events
    test_api_notifications.py  Overdue check, in-app notifications
    test_api_rbac.py           Permission enforcement across all endpoints
  fixtures/
    sample.pdf                 Sample PDF for upload tests

frontend/
  e2e/                         Playwright E2E tests
    auth.spec.js               Login, signup, protected route redirects
    navigation.spec.js         Sidebar nav, document list, admin pages
  playwright.config.js         Playwright configuration

Running Tests
-------------
# Run all backend tests (unit + integration)
pytest tests/ -v

# Run only unit tests
pytest tests/unit/ -v

# Run only integration tests
pytest tests/integration/ -v

# Run with coverage
pytest tests/ -v --cov=app --cov-report=term-missing

# Run specific test file
pytest tests/unit/test_compliance_engine.py -v

# Run specific test class
pytest tests/unit/test_rbac.py::TestRoleInheritance -v

# Run Playwright E2E tests (requires dev servers running)
cd frontend && npx playwright test

# Run Playwright with UI mode
cd frontend && npx playwright test --ui

# Run specific Playwright test
cd frontend && npx playwright test e2e/auth.spec.js

Coverage Targets
----------------
- Backend: ≥80% (measured via pytest-cov on app/)
- Frontend: ≥70% (measured via vite coverage plugin)

Fixtures Reference
------------------
test_db              Savepoint-wrapped session, auto-rolled back per test
auth_client          TestClient authenticated as admin (testadmin@test.com)
admin_client         TestClient authenticated as org admin (from org_and_users)
reviewer_client      TestClient authenticated as reviewer
manager_client       TestClient authenticated as compliance_manager
owner_client         TestClient authenticated as document_owner
unauth_client        TestClient with no authenticated user
sample_document      Document in the test org
sample_scan          Scan + violations linked to sample_document
sample_review_task   Review task linked to sample_scan
mock_groq            Mocked Groq LLM client
mock_send_email      Mocked SMTP email sender
mock_send_slack      Mocked Slack webhook sender

CI/CD Pipeline
--------------
.github/workflows/ci.yml runs on push/PR:
1. Backend lint (ruff check + format)
2. Backend unit tests (with coverage)
3. Backend integration tests
4. Frontend lint (eslint)
5. Frontend build (vite)
6. E2E tests (Playwright + Chromium)
7. Coverage report on PRs
