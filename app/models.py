"""
models.py — SQLAlchemy ORM models for documents, versions, and feedback.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="organization")

    def __repr__(self) -> str:
        return f"<Organization id={self.id} name='{self.name}'>"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="document_owner")
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="users")

    def __repr__(self) -> str:
        return f"<User id={self.id} email='{self.email}' role='{self.role}'>"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(Integer, nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AuditLog id={self.id} user={self.user_id} action='{self.action}'>"


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    # File identity
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    content_hash = Column(String(64), nullable=True, index=True)
    file_path = Column(String(512), nullable=True)

    # Version grouping
    document_group_id = Column(String(64), index=True, nullable=True)
    version_number = Column(Integer, default=1)

    # Processing results
    page_count = Column(Integer, nullable=True)
    total_chunks = Column(Integer, default=0)
    has_ocr_pages = Column(Boolean, default=False)
    full_text = Column(Text, nullable=True)

    # Lifecycle
    upload_time = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="processing")
    error_message = Column(Text, nullable=True)

    # Compliance frameworks selected during upload
    frameworks = Column(Text, nullable=True)  # JSON array e.g. '["GDPR","CCPA"]'

    # Vector store reference
    collection_name = Column(String(255), nullable=True)

    # Audit score
    audit_score = Column(Integer, nullable=True)

    # Ownership
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)

    uploader = relationship("User", foreign_keys=[user_id])

    # Relationship to versions
    versions = relationship("DocumentVersion", back_populates="document",
                            order_by="DocumentVersion.version_number",
                            cascade="all, delete-orphan")

    # Relationship to scans
    scans = relationship("Scan", back_populates="document", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return (
            f"<Document id={self.id} file='{self.filename}' "
            f"v{self.version_number} status='{self.status}'>"
        )


class DocumentVersion(Base):
    """
    Immutable snapshot of each document version for history and diff.
    Created on every upload — never modified after creation.
    """
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)

    version_number = Column(Integer, nullable=False)
    filename = Column(String(255), nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    page_count = Column(Integer, nullable=True)
    total_chunks = Column(Integer, default=0)
    has_ocr_pages = Column(Boolean, default=False)

    # Full extracted text for diff computation
    full_text = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document", back_populates="versions")

    def __repr__(self) -> str:
        return f"<DocumentVersion doc={self.document_id} v{self.version_number}>"


class AuditFeedback(Base):
    """Stores human review feedback for specific rule violations."""
    __tablename__ = "audit_feedback"

    id = Column(Integer, primary_key=True, index=True)
    collection_name = Column(String(255), index=True, nullable=False)
    rule_id = Column(String(255), index=True, nullable=False)

    # 'confirmed' or 'false_positive'
    status = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)

    # Ownership & org scoping
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=True, index=True)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<AuditFeedback {self.collection_name} | {self.rule_id} -> {self.status}>"


class Scan(Base):
    """Records individual framework audits, score, grade, status."""
    __tablename__ = "scans"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_group_id = Column(String(36), index=True, nullable=True)
    framework = Column(String(50), nullable=False)
    status = Column(String(50), default="pending")  # pending, running, completed, failed
    score = Column(Integer, nullable=True)
    grade = Column(String(10), nullable=True)
    violation_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    # Scan metadata (selective revalidation)
    scan_type = Column(String(20), default="full")         # "full" | "selective" | "incremental"
    rules_evaluated = Column(Integer, nullable=True)        # how many rules were actually run via LLM
    rules_skipped = Column(Integer, nullable=True)          # rules carried forward from prior scan
    chunks_diffed = Column(Integer, nullable=True)          # number of chunks compared in diff
    changed_chunks = Column(Integer, nullable=True)         # number of chunks that changed
    changed_percentage = Column(Float, nullable=True)       # percentage of document changed

    document = relationship("Document", back_populates="scans")
    violations = relationship("Violation", back_populates="scan", cascade="all, delete-orphan")
    evaluations = relationship("RuleEvaluation", back_populates="scan", cascade="all, delete-orphan")
    review_tasks = relationship("ReviewTask", back_populates="scan", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Scan id={self.id} doc={self.document_id} framework={self.framework} status={self.status}>"


class Violation(Base):
    """Records individual rule failures, descriptions, excerpt, severity."""
    __tablename__ = "violations"

    __table_args__ = (
        UniqueConstraint("scan_id", "rule_id", name="uq_violation_scan_rule"),
    )

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    framework = Column(String(50), nullable=False)
    severity = Column(String(50), nullable=False)  # critical, high, medium, low
    clause = Column(String(100), nullable=True)
    description = Column(Text, nullable=False)
    excerpt = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    confidence = Column(Integer, nullable=True)     # 0-100
    source_chunks = Column(Text, nullable=True)     # JSON array of chunk references
    page_number = Column(Integer, nullable=True)    # Primary page where violation was found
    status = Column(String(50), default="open")  # open, pending, assigned, in_review, approved, resolved, dismissed
    assigned_to = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Cross-version tracking (selective revalidation)
    document_version = Column(Integer, nullable=True)       # version_number when this violation was found
    section_path = Column(String(512), nullable=True)       # semantic location e.g. "Privacy > Cookies > Third Party"
    chunk_hash = Column(String(64), nullable=True)          # SHA-256 of primary source chunk text
    previous_violation_id = Column(Integer, ForeignKey("violations.id", ondelete="SET NULL"), nullable=True)

    scan = relationship("Scan", back_populates="violations")
    previous_violation = relationship("Violation", remote_side="Violation.id", foreign_keys=[previous_violation_id])

    def __repr__(self) -> str:
        return f"<Violation id={self.id} scan={self.scan_id} rule={self.rule_id}>"


class RuleEvaluation(Base):
    """Stores the result of every individual rule evaluation (pass, fail, warning, error)."""
    __tablename__ = "rule_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(String(100), nullable=False)
    rule_name = Column(String(255), nullable=False)
    framework = Column(String(50), nullable=False)
    article = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False)  # passed, failed, warning, error, skipped
    confidence = Column(Integer, nullable=True)  # 0-100
    severity = Column(String(50), nullable=True)  # none, low, medium, high, critical
    explanation = Column(Text, nullable=True)
    analysis = Column(Text, nullable=True)
    remediation = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    chunks_checked = Column(Integer, default=0)
    points_deducted = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    scan = relationship("Scan", back_populates="evaluations")

    def __repr__(self) -> str:
        return f"<RuleEvaluation id={self.id} scan={self.scan_id} rule={self.rule_id} status={self.status}>"


class ReviewTask(Base):
    """Human-in-the-loop review queue for low-confidence or submitted-for-review violations."""
    __tablename__ = "review_tasks"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_evaluation_id = Column(Integer, ForeignKey("rule_evaluations.id", ondelete="SET NULL"), nullable=True)
    rule_id = Column(String(100), nullable=False)
    rule_name = Column(String(255), nullable=False)
    framework = Column(String(50), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    reason = Column(String(255), nullable=False)  # low_confidence, evaluation_error, submitted_for_review, ...
    status = Column(String(50), default="pending")  # pending, assigned, in_review, approved, resolved, dismissed, changes_requested
    assigned_to = Column(String(255), nullable=True)
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    submitted_by = Column(String(255), nullable=True)
    submitted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_by = Column(String(255), nullable=True)
    suggestion_id = Column(Integer, ForeignKey("remediation_suggestions.id", ondelete="SET NULL"), nullable=True)
    due_date = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)

    # Cross-version linking
    violation_link_id = Column(Integer, ForeignKey("violations.id", ondelete="SET NULL"), nullable=True)

    scan = relationship("Scan", back_populates="review_tasks")
    document = relationship("Document")

    def __repr__(self) -> str:
        return f"<ReviewTask id={self.id} scan={self.scan_id} rule={self.rule_id} status={self.status}>"


class ReviewTaskEvent(Base):
    """Immutable audit trail of every state transition on a review task."""
    __tablename__ = "review_task_events"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("review_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False)
    old_value = Column(String(255), nullable=True)
    new_value = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])

    def __repr__(self) -> str:
        return f"<ReviewTaskEvent id={self.id} task={self.task_id} type='{self.event_type}'>"


class RemediationSuggestion(Base):
    """AI-generated fix suggestion for a specific violation — original vs. compliant text."""
    __tablename__ = "remediation_suggestions"

    id = Column(Integer, primary_key=True, index=True)
    violation_id = Column(Integer, ForeignKey("violations.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="CASCADE"), nullable=False)
    rule_id = Column(String(100), nullable=False)
    original_clause = Column(Text, nullable=False)
    suggested_clause = Column(Text, nullable=False)
    section_reference = Column(String(255), nullable=True)
    reasoning = Column(Text, nullable=True)
    status = Column(String(50), default="pending")  # pending, accepted, rejected, modified, applied
    user_modified_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    violation = relationship("Violation")
    scan = relationship("Scan")

    def __repr__(self) -> str:
        return f"<RemediationSuggestion id={self.id} violation={self.violation_id} status={self.status}>"


class DocumentChunk(Base):
    """Content-addressed chunk storage for cross-version diff and selective revalidation."""
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    page_numbers = Column(Text, nullable=True)        # JSON array e.g. "[7, 8]"
    section_heading = Column(String(255), nullable=True)  # nearest heading above this chunk
    section_path = Column(String(512), nullable=True)     # hierarchical path e.g. "Privacy > Cookies"
    content_hash = Column(String(64), nullable=False, index=True)  # SHA-256 of chunk text
    embedding_stored = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    document = relationship("Document")

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", "chunk_index", name="uq_chunk_doc_ver_idx"),
    )

    def __repr__(self) -> str:
        return f"<DocumentChunk id={self.id} doc={self.document_id} v{self.version_number} idx={self.chunk_index}>"


class ChunkDiff(Base):
    """Cross-version chunk comparison results for selective revalidation."""
    __tablename__ = "chunk_diffs"

    id = Column(Integer, primary_key=True, index=True)
    old_document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    new_document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    old_chunk_id = Column(Integer, ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True)
    new_chunk_id = Column(Integer, ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True)
    similarity_score = Column(Float, nullable=True)     # cosine similarity of embeddings
    change_type = Column(String(20), nullable=False)     # "added" | "removed" | "modified" | "unchanged"
    old_page_number = Column(Integer, nullable=True)
    new_page_number = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    old_document = relationship("Document", foreign_keys=[old_document_id])
    new_document = relationship("Document", foreign_keys=[new_document_id])

    def __repr__(self) -> str:
        return f"<ChunkDiff id={self.id} type={self.change_type} sim={self.similarity_score}>"


class RuleChunkMapping(Base):
    """Rule-to-chunk affinity matrix from scan results — tracks which chunks each rule evaluated."""
    __tablename__ = "rule_chunk_mapping"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String(100), nullable=False, index=True)
    framework = Column(String(50), nullable=False)
    chunk_id = Column(Integer, ForeignKey("document_chunks.id", ondelete="SET NULL"), nullable=True)
    chunk_hash = Column(String(64), nullable=True)       # denormalized for fast lookup
    relevance_score = Column(Float, nullable=True)       # from Qdrant similarity search
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="SET NULL"), nullable=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    chunk = relationship("DocumentChunk")
    scan = relationship("Scan")

    def __repr__(self) -> str:
        return f"<RuleChunkMapping rule={self.rule_id} chunk={self.chunk_id} score={self.relevance_score}>"


class Conversation(Base):
    """Stores chat sessions."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Conversation id={self.id} title={self.title}>"


class Message(Base):
    """Stores individual message content and roles."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # user, assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")

    def __repr__(self) -> str:
        return f"<Message id={self.id} conv={self.conversation_id} role={self.role}>"


class PasswordResetToken(Base):
    """Stores password reset tokens with expiry."""
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<PasswordResetToken user={self.user_id} used={self.used}>"


class Workflow(Base):
    """Workflow definition — a sequence of steps for document compliance review."""
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    framework = Column(String(50), nullable=True, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    steps = relationship("WorkflowStep", back_populates="workflow",
                         order_by="WorkflowStep.order",
                         cascade="all, delete-orphan")
    transitions = relationship("WorkflowTransition", back_populates="workflow",
                               cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Workflow id={self.id} name='{self.name}'>"


class WorkflowStep(Base):
    """A single step within a workflow definition."""
    __tablename__ = "workflow_steps"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    order = Column(Integer, nullable=False)
    assigned_role = Column(String(50), nullable=True)
    step_type = Column(String(50), default="review")
    config = Column(Text, nullable=True)

    workflow = relationship("Workflow", back_populates="steps")

    def __repr__(self) -> str:
        return f"<WorkflowStep id={self.id} name='{self.name}' order={self.order}>"


class WorkflowTransition(Base):
    """Defines a possible transition between steps, with optional conditions."""
    __tablename__ = "workflow_transitions"

    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    source_step_id = Column(Integer, ForeignKey("workflow_steps.id", ondelete="CASCADE"), nullable=False)
    target_step_id = Column(Integer, ForeignKey("workflow_steps.id", ondelete="CASCADE"), nullable=False)
    condition_type = Column(String(50), default="always")
    condition_config = Column(Text, nullable=True)

    workflow = relationship("Workflow", back_populates="transitions")

    def __repr__(self) -> str:
        return f"<WorkflowTransition {self.source_step_id} -> {self.target_step_id} [{self.condition_type}]>"


class WorkflowInstance(Base):
    """Tracks an active workflow for a document and scan."""
    __tablename__ = "workflow_instances"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    scan_id = Column(Integer, ForeignKey("scans.id", ondelete="SET NULL"), nullable=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="SET NULL"), nullable=False, index=True)
    current_step_id = Column(Integer, ForeignKey("workflow_steps.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    tasks = relationship("WorkflowTask", back_populates="instance", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<WorkflowInstance id={self.id} doc={self.document_id} status='{self.status}'>"


class WorkflowTask(Base):
    """A task assigned to a specific user for a workflow step."""
    __tablename__ = "workflow_tasks"

    id = Column(Integer, primary_key=True, index=True)
    instance_id = Column(Integer, ForeignKey("workflow_instances.id", ondelete="CASCADE"), nullable=False, index=True)
    step_id = Column(Integer, ForeignKey("workflow_steps.id", ondelete="SET NULL"), nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(50), default="pending")
    notes = Column(Text, nullable=True)
    completed_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    instance = relationship("WorkflowInstance", back_populates="tasks")

    def __repr__(self) -> str:
        return f"<WorkflowTask id={self.id} instance={self.instance_id} status='{self.status}'>"


class Notification(Base):
    """In-app notification for users."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    type = Column(String(50), default="info")
    resource_type = Column(String(100), nullable=True)
    resource_id = Column(Integer, nullable=True)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self) -> str:
        return f"<Notification id={self.id} user={self.user_id} type='{self.type}' read={self.read}>"


class RoleAssignmentTracker(Base):
    """Tracks the last user assigned per role per organization for round-robin distribution."""
    __tablename__ = "role_assignment_tracker"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(50), nullable=False)
    last_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("organization_id", "role", name="uq_org_role_tracker"),
    )

