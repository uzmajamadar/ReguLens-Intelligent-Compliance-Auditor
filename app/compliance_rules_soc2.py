"""
app/compliance_rules_soc2.py — SOC2 Trust Services Criteria rules.

Covers all five trust principles: Security, Availability, Processing Integrity,
Confidentiality, and Privacy.

Each rule carries:
  - id            : short slug used as dict key
  - name          : human-readable title
  - regulation    : parent regulation (SOC 2)
  - article       : article / section reference
  - search_query  : semantic query sent to Qdrant to retrieve relevant chunks
  - check_question: the compliance question injected into the Groq prompt
  - max_severity  : worst-case severity if this rule is violated (used for scoring)
  - detailed_checks: sub-checks for deeper multi-factor analysis
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass(frozen=True)
class ComplianceRule:
    id: str
    name: str
    regulation: str
    article: str
    search_query: str
    check_question: str
    max_severity: str
    detailed_checks: str = ""


RULES: list[ComplianceRule] = [
    # ── SOC 2: Control Environment ─────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc1_control_environment",
        name="Control Environment & Governance",
        regulation="SOC2",
        article="TSC CC1.x — Control Environment",
        search_query="control environment governance board oversight organizational structure ethics",
        check_question=(
            "Does the document demonstrate a commitment to integrity, ethical values, "
            "and a governance structure that supports internal controls, including board "
            "oversight and clear organizational structure?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) integrity and ethical values are communicated and practiced, "
            "(b) board of directors or equivalent oversees internal control, "
            "(c) organizational structure establishes reporting lines and authority, "
            "(d) competence of personnel is evaluated and maintained, "
            "(e) accountability for internal control responsibilities is established, "
            "(f) HR policies support recruitment, training, and retention of competent staff."
        ),
    ),
    ComplianceRule(
        id="soc2_cc2_communication",
        name="Communication & Information",
        regulation="SOC2",
        article="TSC CC2.x — Communication & Information",
        search_query="communication information internal control objectives roles responsibilities",
        check_question=(
            "Does the document describe how information about internal control responsibilities, "
            "objectives, and relevant policies is communicated to personnel, customers, and third parties?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) internal control objectives are communicated to personnel, "
            "(b) roles and responsibilities for controls are clearly defined, "
            "(c) changes to policies and procedures are communicated in a timely manner, "
            "(d) external communications regarding system boundaries and commitments are defined, "
            "(e) communication channels for reporting control deficiencies exist, "
            "(f) information systems support internal control objectives."
        ),
    ),
    # ── SOC 2: Risk Assessment ─────────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc3_risk_assessment",
        name="Risk Assessment & Management",
        regulation="SOC2",
        article="TSC CC3.x — Risk Assessment",
        search_query="risk assessment management fraud risk change risk business objectives",
        check_question=(
            "Does the document describe a risk assessment process that identifies, analyzes, "
            "and manages risks to achieving the entity's objectives, including fraud risk "
            "and risks from changes in the business environment?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) risk assessment identifies risks to achieving objectives, "
            "(b) fraud risk (including management override) is explicitly considered, "
            "(c) changes in regulatory, economic, and operating environment are assessed, "
            "(d) new personnel, systems, and technologies are evaluated for risk, "
            "(e) significant changes to the business or processes trigger re-assessment, "
            "(f) risk tolerance and risk appetite are defined, "
            "(g) risk responses are designed and implemented."
        ),
    ),
    # ── SOC 2: Monitoring Activities ───────────────────────────────────────
    ComplianceRule(
        id="soc2_cc4_monitoring",
        name="Monitoring of Controls",
        regulation="SOC2",
        article="TSC CC4.x — Monitoring Activities",
        search_query="monitoring controls ongoing evaluations separate evaluations deficiency reporting",
        check_question=(
            "Does the document describe ongoing and separate evaluations to monitor whether "
            "internal controls are operating effectively, including timely reporting of deficiencies?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) ongoing monitoring is performed in the course of normal operations, "
            "(b) separate evaluations are conducted periodically (e.g. internal audits), "
            "(c) scope and frequency of evaluations are risk-based, "
            "(d) control deficiencies are reported to the responsible party and management, "
            "(e) significant deficiencies are reported to senior management and the board, "
            "(f) corrective actions are tracked to resolution."
        ),
    ),
    # ── SOC 2: Control Activities ──────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc5_control_activities",
        name="Control Activities & Segregation of Duties",
        regulation="SOC2",
        article="TSC CC5.x — Control Activities",
        search_query="control activities segregation duties authorization policies procedures approvals",
        check_question=(
            "Does the document define control activities, including segregation of duties, "
            "authorization policies, and approvals, that help ensure management directives are carried out?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) control activities are designed to mitigate identified risks, "
            "(b) segregation of duties exists for incompatible functions, "
            "(c) access to systems and data is authorized and approved, "
            "(d) transactions are authorized before execution, "
            "(e) policies and procedures are documented and accessible, "
            "(f) controls are reviewed and updated when processes change."
        ),
    ),
    # ── SOC 2: Logical & Physical Access ───────────────────────────────────
    ComplianceRule(
        id="soc2_cc6_access_controls",
        name="Logical & Physical Access Controls",
        regulation="SOC2",
        article="TSC CC6.x — Logical & Physical Access",
        search_query="logical access physical access authentication authorization perimeter security",
        check_question=(
            "Does the document describe logical and physical access controls that protect "
            "system resources against unauthorized access, including authentication, "
            "authorization, and physical security measures?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) logical access controls authenticate and authorize users, "
            "(b) physical access to facilities is controlled and monitored, "
            "(c) user access is reviewed periodically and revoked upon termination, "
            "(d) authentication credentials are managed securely (passwords, MFA, keys), "
            "(e) access is granted on a least-privilege and need-to-know basis, "
            "(f) perimeter security controls (firewalls, intrusion detection) protect the boundary, "
            "(g) cryptographic keys are managed securely, "
            "(h) portable media and mobile devices are controlled."
        ),
    ),
    # ── SOC 2: System Operations ──────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc7_system_operations",
        name="System Operations & Incident Management",
        regulation="SOC2",
        article="TSC CC7.x — System Operations",
        search_query="system operations incident response detection vulnerability management monitoring",
        check_question=(
            "Does the document describe system operations procedures including vulnerability "
            "management, intrusion detection, incident response, and problem management?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) system operations are managed according to defined procedures, "
            "(b) intrusion detection and prevention systems are deployed and monitored, "
            "(c) incident response plan is documented and tested, "
            "(d) security incidents are detected, reported, and remediated promptly, "
            "(e) vulnerability management includes scanning, prioritization, and patching, "
            "(f) problem management identifies root causes and prevents recurrence, "
            "(g) production changes follow a defined change management process, "
            "(h) backup and recovery procedures are documented and tested."
        ),
    ),
    # ── SOC 2: Change Management ───────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc8_change_management",
        name="Change Management",
        regulation="SOC2",
        article="TSC CC8.x — Change Management",
        search_query="change management system changes authorization testing approval deployment",
        check_question=(
            "Does the document describe a change management process that authorizes, tests, "
            "approves, and documents changes to the system infrastructure, software, and configurations?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) changes are identified, documented, and classified by risk, "
            "(b) changes are authorized before implementation, "
            "(c) changes are tested before moving to production, "
            "(d) emergency changes follow a separate rapid process but are retrospectively approved, "
            "(e) change logs are maintained and reviewed, "
            "(f) separation of duties between development, testing, and production environments, "
            "(g) software development follows secure coding practices."
        ),
    ),
    # ── SOC 2: Risk Mitigation ────────────────────────────────────────────
    ComplianceRule(
        id="soc2_cc9_risk_mitigation",
        name="Risk Mitigation & Vendor Management",
        regulation="SOC2",
        article="TSC CC9.x — Risk Mitigation",
        search_query="risk mitigation vendor management third party business continuity supplier",
        check_question=(
            "Does the document describe how risks from third-party vendors, business partners, "
            "and other external parties are identified, assessed, and mitigated?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) vendor risk assessment is performed before engagement, "
            "(b) critical vendors are reviewed periodically (e.g. SOC 2 reports, audits), "
            "(c) contracts include security requirements and service level commitments, "
            "(d) business continuity and disaster recovery plans address vendor dependencies, "
            "(e) vendor access to systems and data is restricted and monitored, "
            "(f) insurance coverage for security incidents is maintained."
        ),
    ),
    # ── SOC 2: Availability ────────────────────────────────────────────────
    ComplianceRule(
        id="soc2_a1_availability",
        name="System Availability & Business Continuity",
        regulation="SOC2",
        article="TSC A1.x — Availability",
        search_query="system availability business continuity disaster recovery uptime SLAs capacity",
        check_question=(
            "Does the document describe how the system maintains availability as committed, "
            "including business continuity planning, disaster recovery, capacity management, "
            "and monitoring against service level commitments?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) availability commitments and SLAs are defined and documented, "
            "(b) business continuity plan (BCP) is documented and tested, "
            "(c) disaster recovery plan (DRP) includes RTO and RPO targets, "
            "(d) capacity management ensures adequate resources for committed availability, "
            "(e) system availability is monitored and reported against SLAs, "
            "(f) redundant infrastructure is deployed for critical components, "
            "(g) BCP/DRP tests are conducted at defined intervals."
        ),
    ),
    # ── SOC 2: Processing Integrity ────────────────────────────────────────
    ComplianceRule(
        id="soc2_pi1_processing_integrity",
        name="Processing Integrity & Accuracy",
        regulation="SOC2",
        article="TSC PI1.x — Processing Integrity",
        search_query="processing integrity completeness accuracy timeliness authorization reconciliation",
        check_question=(
            "Does the document describe controls that ensure system processing is complete, "
            "accurate, timely, and properly authorized, including input validation, "
            "error handling, and reconciliation procedures?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) input data is validated for completeness and accuracy, "
            "(b) processing errors are detected, logged, and corrected, "
            "(c) output is reconciled against input to verify completeness, "
            "(d) processing is timely according to service level commitments, "
            "(e) transactions are authorized before or during processing, "
            "(f) data is retained according to defined retention schedules, "
            "(g) exceptions and suspense items are managed and resolved."
        ),
    ),
    # ── SOC 2: Confidentiality ─────────────────────────────────────────────
    ComplianceRule(
        id="soc2_c1_confidentiality",
        name="Confidentiality of Information",
        regulation="SOC2",
        article="TSC C1.x — Confidentiality",
        search_query="confidential information protection classification encryption data loss prevention",
        check_question=(
            "Does the document describe controls to protect confidential information, including "
            "data classification, encryption at rest and in transit, data loss prevention, "
            "and secure disposal of confidential information?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) confidential information is classified and labeled, "
            "(b) encryption is used for confidential data at rest and in transit, "
            "(c) data loss prevention (DLP) controls monitor and block unauthorized transfers, "
            "(d) confidential information is securely disposed of when no longer needed, "
            "(e) access to confidential information is restricted to authorized personnel, "
            "(f) confidentiality agreements are signed by personnel and third parties, "
            "(g) confidential information shared with third parties is governed by agreements."
        ),
    ),
    # ── SOC 2: Privacy ─────────────────────────────────────────────────────
    ComplianceRule(
        id="soc2_p1_privacy",
        name="Privacy of Personal Information",
        regulation="SOC2",
        article="TSC P1.x — Privacy",
        search_query="privacy personal information collection consent notice access rights disposal",
        check_question=(
            "Does the document describe controls that address the collection, use, retention, "
            "disclosure, and disposal of personal information in accordance with the entity's "
            "privacy notice and applicable regulations?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) personal information is collected only for identified purposes, "
            "(b) consent is obtained before collection or use, "
            "(c) privacy notice describes collection, use, and sharing practices, "
            "(d) individuals have access to their personal information for review and correction, "
            "(e) personal information is retained only as long as necessary, "
            "(f) personal information is securely disposed of when no longer needed, "
            "(g) disclosures to third parties are tracked and governed, "
            "(h) complaints and inquiries about privacy practices are addressed."
        ),
    ),
]

RULES_BY_ID: dict[str, ComplianceRule] = {r.id: r for r in RULES}
