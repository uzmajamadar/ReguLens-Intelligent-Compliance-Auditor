"""
app/compliance_rules_pci_dss.py — PCI Data Security Standard rules.

Covers all 12 PCI-DSS requirements across 6 control objectives.

Each rule carries:
  - id            : short slug used as dict key
  - name          : human-readable title
  - regulation    : parent regulation (PCI-DSS)
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
    # ── PCI-DSS: Build & Maintain Secure Networks ─────────────────────────
    ComplianceRule(
        id="pci_req1_firewall",
        name="Firewall & Network Security Configuration",
        regulation="PCI-DSS",
        article="Requirement 1",
        search_query="firewall network segmentation DMZ perimeter security router access control list",
        check_question=(
            "Does the document describe firewall and network security configurations that "
            "restrict traffic between trusted and untrusted networks, including a DMZ, "
            "default-deny rules, and network segmentation for cardholder data?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) firewall rules enforce a default-deny policy, "
            "(b) network is segmented so cardholder data environment (CDE) is isolated, "
            "(c) DMZ is used for internet-facing systems, "
            "(d) firewall and router rule sets are reviewed at least every 6 months, "
            "(e) connections from untrusted networks are restricted, "
            "(f) firewall configuration standards are documented, "
            "(g) network diagrams showing CDE boundaries are maintained."
        ),
    ),
    ComplianceRule(
        id="pci_req2_secure_config",
        name="Secure System Configuration Standards",
        regulation="PCI-DSS",
        article="Requirement 2",
        search_query="secure configuration baseline hardening default passwords vendor defaults change",
        check_question=(
            "Does the document describe secure configuration standards for systems and "
            "software, including changing vendor defaults, removing unnecessary services, "
            "and applying hardening baselines?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) system configuration standards are documented and applied, "
            "(b) vendor-supplied defaults (passwords, SNMP strings, accounts) are changed, "
            "(c) unnecessary services, protocols, and daemons are removed or disabled, "
            "(d) insecure protocols (e.g. SSL, TLS 1.0) are explicitly prohibited, "
            "(e) systems are configured with only one primary function per server, "
            "(f) configuration standards are updated as new vulnerabilities are identified."
        ),
    ),
    # ── PCI-DSS: Protect Cardholder Data ───────────────────────────────────
    ComplianceRule(
        id="pci_req3_data_protection",
        name="Protection of Stored Cardholder Data",
        regulation="PCI-DSS",
        article="Requirement 3",
        search_query="cardholder data storage protection encryption truncation hashing masking PAN",
        check_question=(
            "Does the document describe how stored cardholder data is protected, including "
            "encryption, truncation, hashing, or masking of Primary Account Numbers (PAN), "
            "and define data retention and disposal policies?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) PAN is rendered unreadable when stored (encryption, truncation, "
            "hashing, or masking), "
            "(b) sensitive authentication data (CVV, PIN, magnetic stripe) is never stored, "
            "(c) data retention policy defines how long cardholder data is kept, "
            "(d) secure deletion/disposal of cardholder data when no longer needed, "
            "(e) full PAN is displayed only to authorized roles with business need, "
            "(f) encryption keys are managed securely (see Requirement 4)."
        ),
    ),
    ComplianceRule(
        id="pci_req4_encryption_transit",
        name="Encryption of Cardholder Data in Transit",
        regulation="PCI-DSS",
        article="Requirement 4",
        search_query="encryption cardholder data transit TLS strong cryptography open public network",
        check_question=(
            "Does the document require strong encryption (TLS 1.2+) for cardholder data "
            "transmitted over open or public networks, and prohibit transmission of unencrypted PAN?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) strong cryptography (TLS 1.2 or higher) is used for all open/public "
            "network transmissions of cardholder data, "
            "(b) unencrypted PAN is never sent via email, instant messaging, or chat, "
            "(c) encryption policies cover all wireless networks carrying cardholder data, "
            "(d) certificates are managed and validated, "
            "(e) encryption is configured to use only secure cipher suites and protocols."
        ),
    ),
    # ── PCI-DSS: Vulnerability Management ──────────────────────────────────
    ComplianceRule(
        id="pci_req5_anti_malware",
        name="Anti-Malware & Security Software",
        regulation="PCI-DSS",
        article="Requirement 5",
        search_query="anti-malware antivirus protection systems scan malicious software update",
        check_question=(
            "Does the document require anti-malware protection on all systems commonly "
            "affected by malicious software, including regular scans and automatic updates?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) anti-malware software is deployed on all at-risk systems, "
            "(b) anti-malware software is configured for automatic scans and updates, "
            "(c) anti-malware logs are retained and monitored, "
            "(d) anti-malware mechanisms cannot be disabled by unauthorized personnel, "
            "(e) quarterly scans for malware on non-commonly-affected systems (e.g. mainframes)."
        ),
    ),
    ComplianceRule(
        id="pci_req6_patch_management",
        name="Secure Coding & Patch Management",
        regulation="PCI-DSS",
        article="Requirement 6",
        search_query="patch management vulnerability security updates critical high risk application coding",
        check_question=(
            "Does the document describe a patch management process that applies critical "
            "security patches within 30 days and addresses software development security "
            "(secure coding, code review, and application vulnerability testing)?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) critical security patches are applied within 30 days of release, "
            "(b) a risk ranking process identifies critical and high vulnerabilities, "
            "(c) custom application code is reviewed for vulnerabilities (e.g. OWASP Top 10), "
            "(d) software development follows secure coding standards, "
            "(e) application vulnerability scans are performed before release or deployment, "
            "(f) public-facing web applications are tested for vulnerabilities at least annually."
        ),
    ),
    # ── PCI-DSS: Access Control ────────────────────────────────────────────
    ComplianceRule(
        id="pci_req7_access_business_need",
        name="Access Control by Business Need-to-Know",
        regulation="PCI-DSS",
        article="Requirement 7",
        search_query="access control business need to know authorization cardholder data need access",
        check_question=(
            "Does the document restrict access to cardholder data to only those individuals "
            "whose job requires such access, based on documented authorization?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) access to cardholder data is restricted to business need-to-know, "
            "(b) access authorization is documented and approved by management, "
            "(c) access control systems enforce permissions at the system or application level, "
            "(d) access rights are reviewed at least every 6 months."
        ),
    ),
    ComplianceRule(
        id="pci_req8_identity_auth",
        name="Identity & Authentication Management",
        regulation="PCI-DSS",
        article="Requirement 8",
        search_query="identity authentication user ID password MFA multi-factor unique credentials",
        check_question=(
            "Does the document require unique user IDs, strong passwords, and multi-factor "
            "authentication (MFA) for all administrative and remote access to the cardholder "
            "data environment?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) each user has a unique ID (no shared accounts), "
            "(b) strong password policies are enforced (length, complexity, rotation), "
            "(c) MFA is required for administrative access to the CDE, "
            "(d) MFA is required for remote access to the CDE, "
            "(e) inactive user accounts are disabled within 90 days, "
            "(f) terminated user access is revoked immediately, "
            "(g) authentication credentials are not stored in plain text."
        ),
    ),
    ComplianceRule(
        id="pci_req9_physical_access",
        name="Physical Access to Cardholder Data",
        regulation="PCI-DSS",
        article="Requirement 9",
        search_query="physical access security media cardholder data visitor badge destruction disposal",
        check_question=(
            "Does the document describe physical security controls for facilities and media "
            "containing cardholder data, including visitor management, badge access, "
            "inventory, and secure disposal of media?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) physical access to CDE facilities is controlled and monitored, "
            "(b) visitors are authorized, escorted, and their access logged, "
            "(c) physical media containing cardholder data is inventoried and secured, "
            "(d) media is securely destroyed when no longer needed (cross-cut shredding, incineration), "
            "(e) off-site media is authorized and logged, "
            "(f) cameras and/or access control systems monitor sensitive areas."
        ),
    ),
    # ── PCI-DSS: Monitoring & Testing ──────────────────────────────────────
    ComplianceRule(
        id="pci_req10_logging_monitoring",
        name="Logging & Monitoring of Access",
        regulation="PCI-DSS",
        article="Requirement 10",
        search_query="audit logging access monitoring log review security events trail cardholder data",
        check_question=(
            "Does the document require audit logging and monitoring of all access to "
            "cardholder data and network resources, with logs retained for at least 12 "
            "months and daily review of security events?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) audit trails link all access to individual users, "
            "(b) logs capture user identification, event type, date/time, success/failure, "
            "and origination of events, "
            "(c) logs are retained for at least 12 months (3 months immediately accessible), "
            "(d) daily review of security events and logs is performed, "
            "(e) audit trails are protected from modification and unauthorized access, "
            "(f) time synchronization (e.g. NTP) ensures accurate timestamps."
        ),
    ),
    ComplianceRule(
        id="pci_req11_testing",
        name="Regular Security Testing",
        regulation="PCI-DSS",
        article="Requirement 11",
        search_query="vulnerability scanning penetration testing quarterly annually ASV network segmentation",
        check_question=(
            "Does the document require regular security testing including quarterly external "
            "vulnerability scans (by ASV), annual penetration testing, and periodic internal "
            "vulnerability scans?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) external vulnerability scans are performed quarterly by an ASV, "
            "(b) internal vulnerability scans are performed at least quarterly and after changes, "
            "(c) annual penetration testing covers network and application layers, "
            "(d) penetration tests attempt to exploit segmentation and access controls, "
            "(e) scan and test findings are remediated and re-scanned until passing, "
            "(f) intrusion detection/prevention systems (IDS/IPS) are deployed and monitored."
        ),
    ),
    # ── PCI-DSS: Information Security Policy ───────────────────────────────
    ComplianceRule(
        id="pci_req12_security_policy",
        name="Information Security Policy & Risk Management",
        regulation="PCI-DSS",
        article="Requirement 12",
        search_query="security policy risk management incident response plan annual review security awareness",
        check_question=(
            "Does the document describe an information security policy that is reviewed "
            "annually, includes incident response planning, security awareness training, "
            "and assignment of security responsibilities?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) information security policy is maintained, approved, and published, "
            "(b) policy is reviewed at least annually and updated as needed, "
            "(c) risk assessment process is performed at least annually, "
            "(d) incident response plan is documented and tested at least annually, "
            "(e) security awareness training is provided to all personnel at hire and annually, "
            "(f) security responsibilities are formally assigned, "
            "(g) third-party service providers with access to CDE are managed and monitored, "
            "(h) a quarterly review of all PCI-DSS requirements is documented."
        ),
    ),
]

RULES_BY_ID: dict[str, ComplianceRule] = {r.id: r for r in RULES}
