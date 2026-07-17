"""Unit tests for workflow engine helpers and logic."""
import json
import pytest
from datetime import datetime, timezone, timedelta

from app.models import (
    Document, Organization, Scan, User, Violation,
    Workflow, WorkflowInstance, WorkflowStep, WorkflowTransition,
    RoleAssignmentTracker,
)
from app.auth import hash_password
from app.workflow_engine import (
    _evaluate_condition,
    _find_user_by_role,
    _highest_severity_for_scan,
)


@pytest.fixture
def wf_data(test_db):
    org = Organization(name="WF Test Org")
    test_db.add(org)
    test_db.flush()

    admin = User(
        name="Admin", email="admin@wf.com",
        password_hash=hash_password("pass"), role="admin",
        organization_id=org.id,
    )
    reviewer = User(
        name="Reviewer", email="reviewer@wf.com",
        password_hash=hash_password("pass"), role="reviewer",
        organization_id=org.id,
    )
    cm = User(
        name="CM", email="cm@wf.com",
        password_hash=hash_password("pass"), role="compliance_manager",
        organization_id=org.id,
    )
    test_db.add_all([admin, reviewer, cm])
    test_db.flush()

    doc = Document(
        filename="wf.pdf", original_filename="wf.pdf",
        file_size_bytes=1024, status="indexed",
        user_id=admin.id, organization_id=org.id,
    )
    test_db.add(doc)
    test_db.flush()

    scan = Scan(
        document_id=doc.id, framework="GDPR",
        status="completed", score=65, grade="C",
    )
    test_db.add(scan)
    test_db.flush()

    workflow = Workflow(
        organization_id=org.id, name="Test WF",
        framework="GDPR", is_active=True,
    )
    test_db.add(workflow)
    test_db.flush()

    step1 = WorkflowStep(
        workflow_id=workflow.id, name="Step 1", order=1,
        assigned_role="reviewer", step_type="review",
    )
    step2 = WorkflowStep(
        workflow_id=workflow.id, name="Step 2", order=2,
        assigned_role="compliance_manager", step_type="approval",
    )
    step3 = WorkflowStep(
        workflow_id=workflow.id, name="Resolved", order=3,
        assigned_role=None, step_type="system",
    )
    test_db.add_all([step1, step2, step3])
    test_db.flush()

    t1 = WorkflowTransition(
        workflow_id=workflow.id,
        source_step_id=step1.id, target_step_id=step2.id,
        condition_type="always",
    )
    t2 = WorkflowTransition(
        workflow_id=workflow.id,
        source_step_id=step2.id, target_step_id=step3.id,
        condition_type="on_approve",
    )
    test_db.add_all([t1, t2])
    test_db.commit()

    return {
        "org": org, "admin": admin, "reviewer": reviewer,
        "cm": cm, "doc": doc, "scan": scan,
        "workflow": workflow, "step1": step1,
        "step2": step2, "step3": step3,
    }


class TestHighestSeverityForScan:
    def test_returns_none_when_no_violations(self, test_db, wf_data):
        scan = Scan(
            document_id=wf_data["doc"].id, framework="HIPAA",
            status="completed", score=100, grade="A",
        )
        test_db.add(scan)
        test_db.flush()
        assert _highest_severity_for_scan(test_db, scan.id) == "none"

    def test_returns_highest_severity(self, test_db, wf_data):
        scan = wf_data["scan"]
        low = Violation(scan_id=scan.id, rule_id="r1", title="Low", framework="GDPR",
                         severity="low", status="open", description="d")
        high = Violation(scan_id=scan.id, rule_id="r2", title="High", framework="GDPR",
                          severity="high", status="open", description="d")
        med = Violation(scan_id=scan.id, rule_id="r3", title="Med", framework="GDPR",
                         severity="medium", status="open", description="d")
        test_db.add_all([low, high, med])
        test_db.flush()
        assert _highest_severity_for_scan(test_db, scan.id) == "high"

    def test_critical_is_highest(self, test_db, wf_data):
        scan = wf_data["scan"]
        v = Violation(scan_id=scan.id, rule_id="r1", title="Crit", framework="GDPR",
                       severity="critical", status="open", description="d")
        test_db.add(v)
        test_db.flush()
        assert _highest_severity_for_scan(test_db, scan.id) == "critical"


class TestEvaluateCondition:
    def test_always_returns_true(self, test_db, wf_data):
        t = wf_data["step1"]  # use any transition mock
        transition = test_db.query(WorkflowTransition).first()
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is True

    def test_on_approve_returns_true(self, test_db, wf_data):
        transition = test_db.query(WorkflowTransition).filter(
            WorkflowTransition.condition_type == "on_approve",
        ).first()
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is True

    def test_on_reject_returns_true(self, test_db, wf_data):
        transition = WorkflowTransition(condition_type="on_reject")
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is True

    def test_severity_gte_met(self, test_db, wf_data):
        scan = wf_data["scan"]
        v = Violation(scan_id=scan.id, rule_id="r1", title="V", framework="GDPR",
                       severity="high", status="open", description="d")
        test_db.add(v)
        test_db.flush()
        transition = WorkflowTransition(
            condition_type="severity",
            condition_config=json.dumps({"operator": "gte", "value": "medium"}),
        )
        assert _evaluate_condition(transition, scan.id, test_db) is True

    def test_severity_gte_not_met(self, test_db, wf_data):
        scan = wf_data["scan"]
        v = Violation(scan_id=scan.id, rule_id="r1", title="V", framework="GDPR",
                       severity="low", status="open", description="d")
        test_db.add(v)
        test_db.flush()
        transition = WorkflowTransition(
            condition_type="severity",
            condition_config=json.dumps({"operator": "gte", "value": "high"}),
        )
        assert _evaluate_condition(transition, scan.id, test_db) is False

    def test_severity_eq(self, test_db, wf_data):
        scan = wf_data["scan"]
        v = Violation(scan_id=scan.id, rule_id="r1", title="V", framework="GDPR",
                       severity="medium", status="open", description="d")
        test_db.add(v)
        test_db.flush()
        transition = WorkflowTransition(
            condition_type="severity",
            condition_config=json.dumps({"operator": "eq", "value": "medium"}),
        )
        assert _evaluate_condition(transition, scan.id, test_db) is True

    def test_severity_no_config_returns_false(self, test_db, wf_data):
        transition = WorkflowTransition(condition_type="severity")
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is False

    def test_severity_bad_json_returns_false(self, test_db, wf_data):
        transition = WorkflowTransition(
            condition_type="severity",
            condition_config="not-json",
        )
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is False

    def test_confidence_gte_met(self, test_db, wf_data):
        scan = wf_data["scan"]
        scan.score = 80
        test_db.flush()
        transition = WorkflowTransition(
            condition_type="confidence",
            condition_config=json.dumps({"operator": "gte", "value": 50}),
        )
        assert _evaluate_condition(transition, scan.id, test_db) is True

    def test_confidence_lt_met(self, test_db, wf_data):
        scan = wf_data["scan"]
        scan.score = 30
        test_db.flush()
        transition = WorkflowTransition(
            condition_type="confidence",
            condition_config=json.dumps({"operator": "lt", "value": 50}),
        )
        assert _evaluate_condition(transition, scan.id, test_db) is True

    def test_unknown_condition_returns_false(self, test_db, wf_data):
        transition = WorkflowTransition(condition_type="unknown_type")
        assert _evaluate_condition(transition, wf_data["scan"].id, test_db) is False


class TestFindUserByRole:
    def test_returns_first_user(self, test_db, wf_data):
        user = _find_user_by_role(test_db, "reviewer", wf_data["org"].id)
        assert user is not None
        assert user.role == "reviewer"

    def test_returns_none_when_no_users(self, test_db, wf_data):
        user = _find_user_by_role(test_db, "document_owner", wf_data["org"].id)
        assert user is None

    def test_round_robin_rotation(self, test_db, wf_data):
        u1 = _find_user_by_role(test_db, "reviewer", wf_data["org"].id)
        assert u1.id == wf_data["reviewer"].id
        u2 = _find_user_by_role(test_db, "reviewer", wf_data["org"].id)
        assert u2.id == wf_data["reviewer"].id

    def test_ignores_inactive_users(self, test_db, wf_data):
        wf_data["reviewer"].is_active = False
        test_db.flush()
        user = _find_user_by_role(test_db, "reviewer", wf_data["org"].id)
        assert user is None or user.id != wf_data["reviewer"].id
