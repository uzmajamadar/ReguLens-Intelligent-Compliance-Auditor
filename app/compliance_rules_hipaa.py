"""
app/compliance_rules_hipaa.py — HIPAA Privacy, Security & Breach Notification rules.

Each rule carries:
  - id            : short slug used as dict key
  - name          : human-readable title
  - regulation    : parent regulation (HIPAA)
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
    # ── HIPAA Privacy Rule ─────────────────────────────────────────────────
    ComplianceRule(
        id="hipaa_privacy_npp",
        name="Notice of Privacy Practices",
        regulation="HIPAA",
        article="45 CFR § 164.520",
        search_query="notice of privacy practices NPP uses disclosures PHI rights",
        check_question=(
            "Does the document include a Notice of Privacy Practices (NPP) that describes "
            "how protected health information (PHI) may be used and disclosed, and informs "
            "individuals of their privacy rights?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) NPP describes permitted uses and disclosures of PHI, "
            "(b) NPP states the covered entity's legal duties and privacy practices, "
            "(c) NPP describes individual rights (access, amendment, accounting, restrictions, "
            "confidential communications, complaint process), "
            "(d) NPP includes a point of contact for further information and complaints, "
            "(e) NPP states that the entity will notify individuals following a breach, "
            "(f) NPP is provided to each individual at or before first service encounter, "
            "(g) NPP is posted prominently at service delivery sites and on the website, "
            "(h) NPP is available in languages commonly spoken in the service area."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_authorization",
        name="Authorization for Uses & Disclosures",
        regulation="HIPAA",
        article="45 CFR § 164.508",
        search_query="authorization uses disclosures PHI written permission marketing psychotherapy notes",
        check_question=(
            "Does the document require a valid written authorization for uses and disclosures "
            "of PHI that are not otherwise permitted by the Privacy Rule (e.g. marketing, "
            "psychotherapy notes, sale of PHI)?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) authorization is required for uses/disclosures not otherwise permitted, "
            "(b) authorization for marketing requires specific language about remuneration, "
            "(c) authorization for psychotherapy notes requires separate specific authorization, "
            "(d) sale of PHI requires authorization stating that remuneration is involved, "
            "(e) authorization must be in plain language and contain specific core elements, "
            "(f) individual may revoke authorization in writing at any time, "
            "(g) treatment, payment, enrollment eligibility may not be conditioned on authorization "
            "(except for research or health insurance underwriting)."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_minimum_necessary",
        name="Minimum Necessary Standard",
        regulation="HIPAA",
        article="45 CFR § 164.502(b), § 164.514(d)",
        search_query="minimum necessary use disclosure PHI limited data set need to know",
        check_question=(
            "Does the document enforce the minimum necessary standard, requiring that "
            "only the minimum amount of PHI necessary is used, disclosed, or requested?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) policies identify persons or classes who need access to PHI, "
            "(b) policies identify the type or amount of PHI needed for each role, "
            "(c) routine or recurring disclosures follow established protocols, "
            "(d) non-routine disclosures are reviewed on a case-by-case basis, "
            "(e) requests for PHI from other covered entities are limited to minimum necessary, "
            "(f) minimum necessary does not apply to treatment disclosures or to the individual, "
            "(g) de-identified data or limited data sets are used where possible."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_access",
        name="Individual Right of Access",
        regulation="HIPAA",
        article="45 CFR § 164.524",
        search_query="right of access inspect copy PHI designated record set 30 days",
        check_question=(
            "Does the document acknowledge an individual's right to access and obtain copies "
            "of their PHI in a designated record set within 30 days of request?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) right to inspect and obtain a copy of PHI in designated record set, "
            "(b) response time of 30 days (extendable once by 30 days with written notice), "
            "(c) form and format of access (requested format or readable hard copy), "
            "(d) fees limited to labor, supplies, and postage (not retrieval or processing), "
            "(e) denial is limited to specific grounds and must include review rights, "
            "(f) right to request electronic copy if PHI is maintained electronically, "
            "(g) right to direct copy to a designated third party."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_amendment",
        name="Right to Amend PHI",
        regulation="HIPAA",
        article="45 CFR § 164.526",
        search_query="right to amend PHI correction designated record set amendment request",
        check_question=(
            "Does the document describe an individual's right to request amendment of "
            "their PHI in a designated record set and the process for responding?"
        ),
        max_severity="medium",
        detailed_checks=(
            "Check each: (a) right to request amendment of PHI in designated record set, "
            "(b) response time of 60 days (extendable once by 30 days), "
            "(c) process for acting on the request (accept or deny in writing), "
            "(d) grounds for denial (not created by entity, not part of designated record set, "
            "would not be available for access, accurate and complete), "
            "(e) right to submit a statement of disagreement if amendment is denied, "
            "(f) entity must append the disagreement statement to the PHI, "
            "(g) entity must notify affected business associates and other parties."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_accounting",
        name="Accounting of Disclosures",
        regulation="HIPAA",
        article="45 CFR § 164.528",
        search_query="accounting of disclosures PHI who what when why 6 years",
        check_question=(
            "Does the document describe an individual's right to receive an accounting "
            "of disclosures of their PHI made in the past 6 years?"
        ),
        max_severity="medium",
        detailed_checks=(
            "Check each: (a) right to accounting of disclosures for up to 6 years prior, "
            "(b) accounting includes date, recipient, description, and purpose of disclosure, "
            "(c) response time of 60 days (extendable once by 30 days), "
            "(d) first accounting per 12-month period is free, "
            "(e) disclosures for TPO, to individual, and pursuant to authorization are excluded, "
            "(f) accounting for disclosures through EHR is required for 3 years (HITECH)."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_restriction",
        name="Right to Request Restrictions",
        regulation="HIPAA",
        article="45 CFR § 164.522",
        search_query="right to request restriction PHI disclosure health plan out of pocket",
        check_question=(
            "Does the document describe an individual's right to request restrictions on "
            "uses and disclosures of their PHI, including the special out-of-pocket rule?"
        ),
        max_severity="medium",
        detailed_checks=(
            "Check each: (a) right to request restrictions on uses/disclosures of PHI, "
            "(b) covered entity is not required to agree except for the out-of-pocket rule, "
            "(c) special rule: if PHI pertains solely to a service paid in full out-of-pocket, "
            "disclosure to health plan for payment/operations may be prohibited, "
            "(d) termination of restriction must be agreed to in writing, "
            "(e) right to request confidential communications (alternative means or locations), "
            "(f) requests must be accommodated if reasonable."
        ),
    ),
    ComplianceRule(
        id="hipaa_privacy_complaints",
        name="Complaint Process & Non-Retaliation",
        regulation="HIPAA",
        article="45 CFR § 164.530(d)",
        search_query="complaint process privacy violation non-retaliation file complaint OCR",
        check_question=(
            "Does the document describe a process for filing complaints about privacy "
            "practices and include a non-retaliation policy for individuals who file complaints?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) process for filing complaints with the covered entity, "
            "(b) process for filing complaints with the Secretary of HHS/OCR, "
            "(c) non-retaliation policy for individuals who file complaints, "
            "(d) no intimidation or threat of retaliation for exercising privacy rights, "
            "(e) complaint process is described in the NPP, "
            "(f) complaint records are retained for 6 years."
        ),
    ),
    # ── HIPAA Security Rule ────────────────────────────────────────────────
    ComplianceRule(
        id="hipaa_security_risk_analysis",
        name="Risk Analysis & Risk Management",
        regulation="HIPAA",
        article="45 CFR § 164.308(a)(1)",
        search_query="risk analysis risk assessment security management vulnerabilities threats ePHI",
        check_question=(
            "Does the document require an accurate and thorough risk analysis of the "
            "confidentiality, integrity, and availability of ePHI, and a risk management "
            "plan to reduce risks to reasonable levels?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) risk analysis identifies potential threats and vulnerabilities to ePHI, "
            "(b) risk assessment includes the likelihood and impact of potential risks, "
            "(c) risk management plan implements measures to reduce risks to a reasonable level, "
            "(d) risk analysis is conducted at regular intervals and when the environment changes, "
            "(e) documentation of risk analysis and risk management plan is maintained, "
            "(f) security measures are reviewed and updated periodically, "
            "(g) assigned security officer is responsible for risk management."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_officer",
        name="Security Officer & Workforce Training",
        regulation="HIPAA",
        article="45 CFR § 164.308(a)(2), (a)(5)",
        search_query="security officer assigned workforce training security awareness periodic",
        check_question=(
            "Does the document designate a security officer responsible for the security "
            "management process and require periodic security awareness training for the workforce?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) a security officer is designated with responsibility for security management, "
            "(b) security awareness and training program is in place for all workforce members, "
            "(c) training includes security reminders, protection from malicious software, "
            "login monitoring, and password management, "
            "(d) training is provided at hiring and periodically thereafter, "
            "(e) training records and documentation are maintained, "
            "(f) sanctions against workforce members who fail to comply with security policies."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_access_control",
        name="Access Control & Unique User Identification",
        regulation="HIPAA",
        article="45 CFR § 164.312(a)",
        search_query="access control unique user identification authentication ePHI authorization",
        check_question=(
            "Does the document implement technical access controls including unique user "
            "identification, emergency access procedures, and automatic logoff for systems "
            "containing ePHI?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) unique user identification is assigned to each user, "
            "(b) emergency access procedure is documented for obtaining ePHI, "
            "(c) automatic logoff is implemented after a predetermined period of inactivity, "
            "(d) encryption and decryption mechanisms are implemented (addressable), "
            "(e) access controls differentiate between users and roles, "
            "(f) access is granted based on minimum necessary and least privilege, "
            "(g) terminated workforce members have access revoked promptly."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_audit_controls",
        name="Audit Controls & Activity Monitoring",
        regulation="HIPAA",
        article="45 CFR § 164.312(b)",
        search_query="audit controls activity monitoring log ePHI access hardware software recording",
        check_question=(
            "Does the document implement audit controls that record and examine activity "
            "in systems containing or using ePHI?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) audit logs record access to ePHI (who, what, when), "
            "(b) audit controls cover hardware, software, and procedural mechanisms, "
            "(c) logs are reviewed regularly for suspicious activity, "
            "(d) audit trails are protected from tampering or unauthorized modification, "
            "(e) log retention period is defined (at least 6 years), "
            "(f) procedures exist to respond to identified security incidents from log review."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_integrity",
        name="Integrity Controls & Authentication",
        regulation="HIPAA",
        article="45 CFR § 164.312(c)",
        search_query="integrity controls ePHI unauthorized modification destruction authentication measures",
        check_question=(
            "Does the document implement policies and procedures to ensure that ePHI is "
            "not improperly altered or destroyed, including electronic authentication measures?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) mechanisms to authenticate ePHI (ensure it has not been altered), "
            "(b) integrity controls protect against unauthorized modification or destruction, "
            "(c) electronic authentication measures verify the source of data, "
            "(d) backup and disaster recovery procedures maintain data integrity, "
            "(e) audit logs can verify the integrity of ePHI over time."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_transmission",
        name="Transmission Security & Encryption",
        regulation="HIPAA",
        article="45 CFR § 164.312(e)",
        search_query="transmission security encryption ePHI electronic communications integrity network",
        check_question=(
            "Does the document implement transmission security measures to protect ePHI "
            "when transmitted over electronic communications networks, including encryption?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) integrity controls ensure ePHI is not improperly modified during transmission, "
            "(b) encryption is used for ePHI transmitted over open networks (addressable), "
            "(c) transmission security covers email, APIs, VPN, and all data in transit, "
            "(d) decryption keys are managed securely, "
            "(e) wireless networks carrying ePHI use approved encryption protocols."
        ),
    ),
    ComplianceRule(
        id="hipaa_security_contingency",
        name="Contingency & Disaster Recovery",
        regulation="HIPAA",
        article="45 CFR § 164.308(a)(7)",
        search_query="contingency plan disaster recovery emergency backup restore ePHI data backup",
        check_question=(
            "Does the document include a contingency plan with data backup, disaster recovery, "
            "and emergency mode operation procedures to ensure ePHI availability during emergencies?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) data backup plan to create retrievable copies of ePHI, "
            "(b) disaster recovery plan to restore ePHI and systems after an emergency, "
            "(c) emergency mode operation plan to continue protecting ePHI during emergencies, "
            "(d) testing and revision procedures for contingency plans, "
            "(e) applications and data critical to continuity are identified, "
            "(f) backup media are stored off-site or in a secure separate location, "
            "(g) contingency plans are reviewed and updated periodically."
        ),
    ),
    # ── HIPAA Breach Notification Rule ─────────────────────────────────────
    ComplianceRule(
        id="hipaa_breach_notification_individuals",
        name="Breach Notification to Individuals",
        regulation="HIPAA",
        article="45 CFR § 164.404",
        search_query="breach notification individuals unsecured PHI without reasonable delay 60 days",
        check_question=(
            "Does the document require notification to affected individuals without unreasonable "
            "delay and no later than 60 days following discovery of a breach of unsecured PHI?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) notification to individuals is without unreasonable delay (≤60 days), "
            "(b) notification includes description of the breach, types of PHI involved, "
            "steps individuals should take, and entity's investigation and mitigation actions, "
            "(c) notification is in plain language and written, "
            "(d) substitute notice is provided if contact information is insufficient, "
            "(e) if urgent threat, notice may be provided by telephone or other means, "
            "(f) notification is not required if risk assessment determines low probability of compromise."
        ),
    ),
    ComplianceRule(
        id="hipaa_breach_notification_media",
        name="Breach Notification to Media",
        regulation="HIPAA",
        article="45 CFR § 164.406",
        search_query="breach notification media major local 500 residents unsecured PHI",
        check_question=(
            "Does the document require notification to prominent media outlets serving a "
            "state or jurisdiction when a breach affects more than 500 residents of that jurisdiction?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) media notification required for breaches affecting >500 residents, "
            "(b) notification is to prominent media outlets serving the affected area, "
            "(c) timing is without unreasonable delay and no later than 60 days, "
            "(d) content of media notification matches individual notification requirements, "
            "(e) media notification is in addition to individual and HHS notification."
        ),
    ),
    ComplianceRule(
        id="hipaa_breach_notification_hhs",
        name="Breach Notification to HHS",
        regulation="HIPAA",
        article="45 CFR § 164.408",
        search_query="breach notification HHS Secretary OCR annual log small breaches 500",
        check_question=(
            "Does the document require notification to the HHS Secretary (OCR) of breaches, "
            "including immediate notice for large breaches (>500) and annual log for smaller breaches?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) breaches affecting >500 individuals are reported to HHS immediately "
            "(no later than 60 days after discovery), "
            "(b) breaches affecting <500 individuals are logged and submitted annually, "
            "(c) HHS notification includes the same content as individual notification, "
            "(d) the annual log is due within 60 days after the end of the calendar year, "
            "(e) the entity maintains a breach log for all breaches regardless of size."
        ),
    ),
    ComplianceRule(
        id="hipaa_breach_risk_assessment",
        name="Breach Risk Assessment",
        regulation="HIPAA",
        article="45 CFR § 164.402",
        search_query="breach risk assessment probability compromise PHI acquisition access disclosure",
        check_question=(
            "Does the document describe a risk assessment process to determine whether an "
            "impermissible use or disclosure of PHI constitutes a breach requiring notification?"
        ),
        max_severity="high",
        detailed_checks=(
            "Check each: (a) four-factor risk assessment is documented "
            "(nature and extent of PHI, unauthorized person who accessed, whether PHI was acquired, "
            "extent of risk mitigation), "
            "(b) if all four factors show low probability of compromise, notification is not required, "
            "(c) risk assessment is conducted in good faith with documented analysis, "
            "(d) risk assessment results are documented and retained for 6 years, "
            "(e) the entity documents the rationale for determining whether notification is required."
        ),
    ),
    # ── HIPAA Administrative Requirements ──────────────────────────────────
    ComplianceRule(
        id="hipaa_admin_business_associates",
        name="Business Associate Agreements",
        regulation="HIPAA",
        article="45 CFR § 164.502(e), § 164.504(e)",
        search_query="business associate agreement BAA PHI subcontractor permitted uses safeguard",
        check_question=(
            "Does the document require written Business Associate Agreements (BAAs) with "
            "business associates and subcontractors that create, receive, or maintain PHI?"
        ),
        max_severity="critical",
        detailed_checks=(
            "Check each: (a) BAAs are required before sharing PHI with business associates, "
            "(b) BAA requires BA to use appropriate safeguards for PHI, "
            "(c) BAA restricts BA's uses/disclosures to those permitted by the agreement, "
            "(d) BAA requires BA to report breaches or security incidents, "
            "(e) BAA requires BA to ensure subcontractors agree to the same restrictions, "
            "(f) BAA requires BA to make PHI available for individual rights, "
            "(g) BAA requires BA to return or destroy PHI at termination, "
            "(h) BAA requires BA to make internal practices available to HHS for investigation."
        ),
    ),
    ComplianceRule(
        id="hipaa_admin_sanctions",
        name="Sanctions & Workforce Compliance",
        regulation="HIPAA",
        article="45 CFR § 164.530(e)",
        search_query="sanctions policy workforce violations HIPAA privacy security disciplinary action",
        check_question=(
            "Does the document describe a sanctions policy for workforce members who fail "
            "to comply with HIPAA privacy and security policies?"
        ),
        max_severity="medium",
        detailed_checks=(
            "Check each: (a) sanction policy applies to all workforce members, "
            "(b) sanctions are applied consistently and without retaliation, "
            "(c) sanctions range from training to termination depending on severity, "
            "(d) sanction records are maintained for 6 years, "
            "(e) the policy is communicated to workforce members, "
            "(f) intentional violations are reported as required by law."
        ),
    ),
]

RULES_BY_ID: dict[str, ComplianceRule] = {r.id: r for r in RULES}
