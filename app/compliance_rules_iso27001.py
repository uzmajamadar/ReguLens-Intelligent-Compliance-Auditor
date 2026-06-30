"""
app/compliance_rules_iso27001.py — ISO27001:2022 Annex A controls.

Covers the key controls across all 4 themes (Organisational, People, Physical, Technological).

Each rule carries:
  - id            : short slug used as dict key
  - name          : human-readable title
  - regulation    : parent regulation (ISO 27001)
  - article       : clause / annex reference
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
    # ── A.5 — Information Security Policies ────────────────────────────────
    ComplianceRule(
        id="iso27001_a5_isp",
        name="Information Security Policy & ISMS",
        regulation="ISO27001",
        article="Annex A.5 — Information Security Policies",
        search_query="information security policy ISMS objectives review policy management commitment",
        check_question=(
            "Does the document define an information security policy that is approved by "
            "management, communicated to all personnel, and reviewed at planned intervals?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) information security policy is defined and approved by management, "
            "(b) policy is communicated to all employees and relevant external parties, "
            "(c) policy is reviewed at planned intervals or when significant changes occur, "
            "(d) policy establishes information security objectives and direction, "
            "(e) ISMS scope is defined and documented, "
            "(f) management demonstrates commitment to the ISMS through resource allocation, "
            "(g) policy includes commitment to continual improvement."
        ),
    ),
    # ── A.6 — Organisation of Information Security ─────────────────────────
    ComplianceRule(
        id="iso27001_a6_roles",
        name="Roles, Responsibilities & Segregation of Duties",
        regulation="ISO27001",
        article="Annex A.6 — Organisation of Information Security",
        search_query="information security roles responsibilities segregation duties contact authorities",
        check_question=(
            "Does the document define information security roles and responsibilities, "
            "segregation of conflicting duties, and establish contact with authorities "
            "and interest groups?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) information security roles and responsibilities are defined and assigned, "
            "(b) conflicting duties and areas of responsibility are segregated to reduce risk, "
            "(c) contacts with relevant authorities (regulators, law enforcement) are maintained, "
            "(d) contacts with special interest groups and security forums are established, "
            "(e) information security is addressed in project management processes, "
            "(f) a management forum or steering group oversees information security."
        ),
    ),
    # ── A.7 — Human Resource Security ──────────────────────────────────────
    ComplianceRule(
        id="iso27001_a7_hr",
        name="Human Resource Security — Screening, Terms & Termination",
        regulation="ISO27001",
        article="Annex A.7 — Human Resource Security",
        search_query="HR security screening employment terms disciplinary process termination responsibilities",
        check_question=(
            "Does the document describe pre-employment screening, terms and conditions "
            "of employment (including security roles), and post-termination responsibilities?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) background verification checks are conducted prior to employment, "
            "(b) employment terms include information security roles and responsibilities, "
            "(c) employees and contractors acknowledge their security responsibilities in writing, "
            "(d) disciplinary process exists for security policy violations, "
            "(e) termination responsibilities are clearly defined and enforced, "
            "(f) return of assets is required upon termination or change of role, "
            "(g) access rights are revoked upon termination or role change."
        ),
    ),
    # ── A.8 — Asset Management ─────────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a8_asset_mgmt",
        name="Asset Inventory, Classification & Acceptable Use",
        regulation="ISO27001",
        article="Annex A.8 — Asset Management",
        search_query="asset inventory classification acceptable use information assets ownership labelling",
        check_question=(
            "Does the document describe an asset management process including an inventory "
            "of information assets, classification and labelling, and acceptable use rules?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) an inventory of all information assets is maintained, "
            "(b) asset owners are identified for each asset in the inventory, "
            "(c) assets are classified based on confidentiality, integrity, and availability, "
            "(d) classification labels are used according to the classification scheme, "
            "(e) acceptable use rules for information and associated assets are defined, "
            "(f) asset handling procedures are defined for each classification level, "
            "(g) asset return procedures are in place upon termination or transfer."
        ),
    ),
    # ── A.9 — Access Control ───────────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a9_access",
        name="Access Control Policy, User Access & Privilege Management",
        regulation="ISO27001",
        article="Annex A.9 — Access Control",
        search_query="access control policy user registration privileged access management access review",
        check_question=(
            "Does the document implement an access control policy covering user registration "
            "and de-registration, privileged access management, and periodic access reviews?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) access control policy is documented and enforced, "
            "(b) user registration and de-registration process is defined, "
            "(c) access provisioning follows a formal approval process, "
            "(d) privileged access rights are restricted and managed separately, "
            "(e) access rights are reviewed at regular intervals (at least annually), "
            "(f) access rights are removed or adjusted upon role change or termination, "
            "(g) authentication methods meet security requirements (MFA for privileged access), "
            "(h) segregation of duties is applied to access management processes."
        ),
    ),
    # ── A.10 — Cryptography ────────────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a10_crypto",
        name="Cryptographic Controls & Key Management",
        regulation="ISO27001",
        article="Annex A.10 — Cryptography",
        search_query="cryptographic controls encryption key management key lifecycle algorithm policy",
        check_question=(
            "Does the document define cryptographic controls for protecting information "
            "at rest and in transit, including a key management policy covering the full "
            "key lifecycle?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) cryptographic controls are defined based on risk assessment, "
            "(b) approved cryptographic algorithms and minimum key lengths are specified, "
            "(c) encryption is used for sensitive information at rest, "
            "(d) encryption is used for sensitive information in transit over untrusted networks, "
            "(e) key management policy covers generation, distribution, storage, rotation, "
            "and destruction of cryptographic keys, "
            "(f) cryptographic keys are protected from unauthorized access and modification, "
            "(g) roles and responsibilities for key management are defined."
        ),
    ),
    # ── A.11 — Physical & Environmental Security ───────────────────────────
    ComplianceRule(
        id="iso27001_a11_physical",
        name="Physical & Environmental Security",
        regulation="ISO27001",
        article="Annex A.11 — Physical & Environmental Security",
        search_query="physical security perimeter secure areas equipment security clear desk clean screen",
        check_question=(
            "Does the document describe physical security perimeters, secure areas, "
            "equipment security, and clear desk / clean screen policies?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) physical security perimeters protect areas containing information assets, "
            "(b) secure areas have appropriate entry controls and physical barriers, "
            "(c) offices, rooms, and facilities are physically secured against unauthorized access, "
            "(d) equipment is protected from threats (fire, flood, power failure, theft), "
            "(e) equipment maintenance is performed by authorized personnel only, "
            "(f) clear desk policy requires sensitive information to be locked away when not in use, "
            "(g) clean screen policy requires unattended devices to be locked or logged off, "
            "(h) secure disposal or re-use of equipment includes data sanitization."
        ),
    ),
    # ── A.12 — Operations Security ─────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a12_operations",
        name="Operations Security — Change Management, Capacity & Malware",
        regulation="ISO27001",
        article="Annex A.12 — Operations Security",
        search_query="change management capacity management malware protection operational procedures logging",
        check_question=(
            "Does the document describe operational procedures including change management, "
            "capacity management, malware protection, event logging, and separation of "
            "development, test, and production environments?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) operational procedures are documented and maintained, "
            "(b) change management process covers all changes to systems and processes, "
            "(c) changes are tested, approved, and reviewed after implementation, "
            "(d) capacity management monitors current usage and forecasts future needs, "
            "(e) malware protection controls are deployed and kept up to date, "
            "(f) event logs record user activities, exceptions, and security events, "
            "(g) logs are protected from tampering and retained for a defined period, "
            "(h) development, test, and production environments are separated."
        ),
    ),
    ComplianceRule(
        id="iso27001_a12_backup",
        name="Backup & Restore Procedures",
        regulation="ISO27001",
        article="Annex A.12.3 — Backup",
        search_query="backup data restore procedures redundancy retention off-site backup testing",
        check_question=(
            "Does the document describe backup processes for information, software, and "
            "system images, including regular testing of restoration procedures?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) backup copies of information, software, and system images are taken regularly, "
            "(b) backup frequency and retention periods are defined, "
            "(c) backup media are stored in a secure off-site location, "
            "(d) restoration procedures are documented and tested at defined intervals, "
            "(e) backup systems are tested to ensure reliability and completeness, "
            "(f) critical systems have redundancy (failover, replication) where applicable, "
            "(g) backup processes cover both on-premises and cloud environments."
        ),
    ),
    # ── A.13 — Communications Security ─────────────────────────────────────
    ComplianceRule(
        id="iso27001_a13_network",
        name="Network Security & Information Transfer",
        regulation="ISO27001",
        article="Annex A.13 — Communications Security",
        search_query="network security segregation information transfer confidentiality agreements electronic messaging",
        check_question=(
            "Does the document describe network security controls (including network "
            "segregation), information transfer policies, confidentiality agreements, "
            "and policies for electronic messaging?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) networks are managed and controlled to protect information, "
            "(b) network segregation isolates sensitive systems from untrusted networks, "
            "(c) information transfer policies cover electronic and physical transfer, "
            "(d) non-disclosure or confidentiality agreements are used with external parties, "
            "(e) electronic messaging (email, instant messaging) has defined security controls, "
            "(f) information involved in inter-organisational transfer is protected, "
            "(g) portable media is subject to security controls during transfer."
        ),
    ),
    # ── A.14 — System Acquisition, Development & Maintenance ───────────────
    ComplianceRule(
        id="iso27001_a14_sdlc",
        name="Secure Development, Acceptance Testing & Change Control",
        regulation="ISO27001",
        article="Annex A.14 — System Acquisition, Development & Maintenance",
        search_query="secure development life cycle security requirements acceptance testing change control",
        check_question=(
            "Does the document describe security requirements for information systems, "
            "secure development life cycle practices, acceptance testing, and change "
            "control procedures?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) information security requirements are defined for new systems "
            "or enhancements to existing systems, "
            "(b) applications are designed and developed following secure coding practices, "
            "(c) security requirements are addressed during system design and development, "
            "(d) acceptance testing includes security criteria, "
            "(e) development, test, and production environments are separated, "
            "(f) system security is reviewed during development milestones, "
            "(g) outsourced development is monitored and audited for security compliance."
        ),
    ),
    # ── A.15 — Supplier Relationships ──────────────────────────────────────
    ComplianceRule(
        id="iso27001_a15_supplier",
        name="Supplier Security, Agreements & Monitoring",
        regulation="ISO27001",
        article="Annex A.15 — Supplier Relationships",
        search_query="supplier security agreements monitoring due diligence third party risk assessment",
        check_question=(
            "Does the document describe supplier security requirements, including due "
            "diligence, security requirements in agreements, and monitoring of supplier "
            "compliance?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) supplier due diligence is conducted before engagement, "
            "(b) information security requirements are included in supplier agreements, "
            "(c) supplier agreements address access, handling, and protection of information, "
            "(d) supplier compliance with security requirements is monitored regularly, "
            "(e) changes to supplier services are managed through change control, "
            "(f) supplier access to information is restricted and logged, "
            "(g) subcontractor cascading is addressed in supplier agreements."
        ),
    ),
    # ── A.16 — Incident Management ─────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a16_incident",
        name="Incident Management, Reporting & Lessons Learned",
        regulation="ISO27001",
        article="Annex A.16 — Incident Management",
        search_query="incident management reporting response escalation lessons learned evidence collection",
        check_question=(
            "Does the document describe an incident management process including reporting "
            "of security events, response and escalation procedures, evidence collection, "
            "and lessons learned?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) security events and incidents are reported through a defined "
            "point of contact in a timely manner, "
            "(b) incident response roles and responsibilities are assigned, "
            "(c) incident response procedures cover detection, containment, eradication, and recovery, "
            "(d) incidents are escalated according to severity and impact, "
            "(e) evidence is collected and preserved according to legal and regulatory requirements, "
            "(f) lessons learned are captured and improvements are implemented, "
            "(g) incident metrics are tracked and reported to management."
        ),
    ),
    # ── A.17 — Business Continuity ─────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a17_bcp",
        name="Business Continuity & Redundancy",
        regulation="ISO27001",
        article="Annex A.17 — Business Continuity",
        search_query="business continuity planning disaster recovery redundancy RTO RPO testing emergency",
        check_question=(
            "Does the document describe business continuity and disaster recovery plans, "
            "including redundancy for information processing facilities and periodic "
            "testing of plans?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) business continuity plans address information security during adverse situations, "
            "(b) disaster recovery procedures are documented and assigned to responsible personnel, "
            "(c) RTO (Recovery Time Objective) and RPO (Recovery Point Objective) are defined, "
            "(d) redundancy is implemented for information processing facilities, "
            "(e) BC/DR plans are tested at planned intervals (at least annually), "
            "(f) test results are documented and corrective actions are tracked, "
            "(g) availability of information processing facilities is monitored."
        ),
    ),
    # ── A.18 — Compliance ──────────────────────────────────────────────────
    ComplianceRule(
        id="iso27001_a18_compliance",
        name="Regulatory Compliance, IP & Records Retention",
        regulation="ISO27001",
        article="Annex A.18 — Compliance",
        search_query="regulatory compliance intellectual property protection records retention privacy data protection",
        check_question=(
            "Does the document describe compliance with legal, regulatory, and contractual "
            "requirements including intellectual property protection, records retention, "
            "and privacy obligations?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) legal, regulatory, and contractual requirements are identified "
            "and documented for each information system, "
            "(b) intellectual property rights (software licenses, copyrights, trademarks) are protected, "
            "(c) records retention schedules define how long information is kept, "
            "(d) privacy and data protection requirements are addressed, "
            "(e) cryptographic controls comply with applicable export/import regulations, "
            "(f) independent review of information security is conducted at planned intervals, "
            "(g) compliance with security policies and standards is audited regularly."
        ),
    ),
]

RULES_BY_ID: dict[str, ComplianceRule] = {r.id: r for r in RULES}
