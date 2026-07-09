import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Shield, FileText, CheckCircle2, BarChart3,
  ClipboardCheck, Activity, Users, Search, Lock, AlertTriangle,
  BookOpen, Layers, GitBranch, Eye, Zap,
  Menu, X, ExternalLink, Sparkles,
} from "lucide-react";

/* ──────────────────────────────────────────────
   Small helper components
   ────────────────────────────────────────────── */

function FrameworkIcon({ name }) {
  const icons = {
    GDPR: <Shield className="size-5" />,
    HIPAA: <Shield className="size-5" />,
    SOC2: <Shield className="size-5" />,
    "PCI DSS": <Shield className="size-5" />,
    "ISO 27001": <Shield className="size-5" />,
  };
  return icons[name] || <Shield className="size-5" />;
}

function FrameworkBadge({ name, className }) {
  return (
    <div className={cn(
      "inline-flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-sm",
      className
    )}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted shrink-0">
        <FrameworkIcon name={name} />
      </div>
      <span className="text-sm font-semibold text-foreground">{name}</span>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }) {
  return (
    <div className="group rounded-xl border bg-card p-6 hover:shadow-md hover:border-foreground/15 transition-all">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/5 mb-4 group-hover:bg-primary/10 transition-colors">
        <Icon className="size-5 text-primary" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ number, title, description, last }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shrink-0">
          {number}
        </div>
        {!last && <div className="w-px flex-1 bg-border my-1" />}
      </div>
      <div className={cn("pb-6", last && "pb-0")}>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ComparisonRow({ label, manual, ai }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-foreground w-40 shrink-0 font-medium">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs text-muted-foreground line-through">{manual}</span>
      </div>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <CheckCircle2 className="size-3.5 text-success shrink-0" />
        <span className="text-xs text-foreground">{ai}</span>
      </div>
    </div>
  );
}

function CapabilityCard({ icon: Icon, title, description }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3.5">
      <div className="flex items-center gap-2.5 mb-1.5">
        <Icon className="size-3.5 text-primary shrink-0" />
        <span className="text-xs font-semibold text-foreground">{title}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function SecurityItem({ icon: Icon, title, description }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 items-center justify-center rounded-lg bg-muted shrink-0 mt-0.5">
        <Icon className="size-4 text-primary" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Section header
   ────────────────────────────────────────────── */

function SectionHeader({ title, subtitle }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-12">
      <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
      {subtitle && <p className="mt-3 text-muted-foreground leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/* ──────────────────────────────────────────────
   Dashboard Mockup (hero visual)
   ────────────────────────────────────────────── */

function DashboardMockup() {
  return (
    <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
      {/* Mockup browser chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b bg-muted/20">
        <div className="size-2.5 rounded-full bg-destructive/60" />
        <div className="size-2.5 rounded-full bg-warning/60" />
        <div className="size-2.5 rounded-full bg-success/60" />
        <div className="ml-4 flex-1 max-w-[200px] h-5 rounded-md bg-muted flex items-center px-2">
          <span className="text-[10px] text-muted-foreground">app.regulens.ai/compliance</span>
        </div>
      </div>

      {/* Mockup content */}
      <div className="p-4 space-y-3">
        {/* Score row */}
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compliance Score</span>
              <span className="text-xs font-semibold text-success">Good</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">82</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted">
              <div className="h-full w-[82%] rounded-full bg-success" />
            </div>
          </div>
          <div className="flex-1 rounded-lg border bg-muted/20 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Documents</span>
            <p className="text-2xl font-bold text-foreground mt-1">24</p>
          </div>
          <div className="flex-1 rounded-lg border bg-muted/20 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Findings</span>
            <p className="text-2xl font-bold text-foreground mt-1">47</p>
          </div>
        </div>

        {/* Framework health */}
        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Framework Health</span>
            <span className="text-[10px] text-muted-foreground">3 active</span>
          </div>
          <div className="space-y-2">
            {[
              { fw: "GDPR", score: 88, color: "bg-success", findings: 3 },
              { fw: "SOC 2", score: 76, color: "bg-warning", findings: 8 },
              { fw: "HIPAA", score: 64, color: "bg-destructive", findings: 12 },
            ].map((f) => (
              <div key={f.fw} className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground w-14">{f.fw}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", f.color)} style={{ width: `${f.score}%` }} />
                </div>
                <span className="text-xs text-muted-foreground">{f.score}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom cards row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              <ClipboardCheck className="size-3" /> Review Queue
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">12</span>
              <span className="text-[10px] text-muted-foreground">pending</span>
            </div>
          </div>
          <div className="rounded-lg border p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
              <BarChart3 className="size-3" /> Active Scans
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-foreground">3</span>
              <span className="text-[10px] text-muted-foreground">in progress</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Document Explorer Mockup
   ────────────────────────────────────────────── */

function DocumentExplorerMockup() {
  return (
    <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b bg-muted/20">
        <div className="size-2.5 rounded-full bg-destructive/60" />
        <div className="size-2.5 rounded-full bg-warning/60" />
        <div className="size-2.5 rounded-full bg-success/60" />
      </div>
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-8 rounded-lg border bg-muted/20 flex items-center px-3">
            <Search className="size-3.5 text-muted-foreground mr-2" />
            <span className="text-xs text-muted-foreground">Search documents...</span>
          </div>
        </div>
        {[
          { name: "GDPR Compliance Policy v3.pdf", score: 92, status: "Compliant", fw: "GDPR" },
          { name: "HIPAA Privacy Procedures.docx", score: 71, status: "Needs Review", fw: "HIPAA" },
          { name: "SOC 2 Security Controls.pdf", score: 84, status: "Compliant", fw: "SOC 2" },
          { name: "Data Protection Policy v2.pdf", score: 65, status: "Action Required", fw: "GDPR" },
        ].map((doc, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border p-2.5 hover:bg-muted/20 transition-colors">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary/5">
              <FileText className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{doc.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground">{doc.fw}</span>
                <div className="w-16 h-1 rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", doc.score >= 80 ? "bg-success" : doc.score >= 60 ? "bg-warning" : "bg-destructive")} style={{ width: `${doc.score}%` }} />
                </div>
                <span className={cn("text-[10px] font-medium", doc.score >= 80 ? "text-success" : doc.score >= 60 ? "text-warning" : "text-destructive")}>{doc.score}%</span>
              </div>
            </div>
            <span className={cn(
              "text-[10px] font-medium rounded-full border px-2 py-0.5 shrink-0",
              doc.status === "Compliant" ? "text-success border-success/20 bg-success/5" :
              doc.status === "Needs Review" ? "text-warning border-warning/20 bg-warning/5" :
              "text-destructive border-destructive/20 bg-destructive/5"
            )}>{doc.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Review Queue Mockup
   ────────────────────────────────────────────── */

function ReviewQueueMockup() {
  return (
    <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Review Queue</span>
        <span className="text-[10px] text-muted-foreground">12 pending</span>
      </div>
      <div className="p-4 space-y-2">
        {[
          { rule: "Data retention policy missing", severity: "Critical", fw: "GDPR", assignee: "Unassigned" },
          { rule: "Access control insufficient", severity: "High", fw: "SOC 2", assignee: "Alice Chen" },
          { rule: "Breach notification procedure", severity: "Medium", fw: "GDPR", assignee: "Bob Smith" },
          { rule: "Encryption standard outdated", severity: "High", fw: "HIPAA", assignee: "Unassigned" },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg border p-2.5 hover:bg-muted/20 transition-colors">
            <div className={cn(
              "size-2 rounded-full shrink-0",
              item.severity === "Critical" ? "bg-destructive" :
              item.severity === "High" ? "bg-orange-500" : "bg-warning"
            )} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{item.rule}</p>
              <p className="text-[10px] text-muted-foreground">{item.assignee} · {item.fw}</p>
            </div>
            <span className={cn(
              "text-[10px] font-medium rounded-full border px-1.5 py-0.5 shrink-0",
              item.severity === "Critical" ? "text-destructive border-destructive/20 bg-destructive/5" :
              item.severity === "High" ? "text-orange-600 border-orange-200 bg-orange-50" :
              "text-warning border-warning/20 bg-warning/5"
            )}>{item.severity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────── */

export default function Landing() {
  const { isAuthenticated, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: "Features", href: "#features" },
    { label: "Solutions", href: "#solutions" },
    { label: "Compliance", href: "#compliance" },
    { label: "Pricing", href: "#", badge: "Coming Soon" },
    { label: "About", href: "#" },
    { label: "GitHub", href: "https://github.com", external: true },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ════════════════════════════════════════
          NAVBAR
          ════════════════════════════════════════ */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto max-w-7xl flex items-center justify-between px-6 h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
              <Shield className="size-4.5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-base font-bold text-foreground tracking-tight">ReguLens</span>
              <span className="text-[9px] text-muted-foreground uppercase tracking-widest block leading-none mt-px">AI</span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              link.external ? (
                <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                  {link.label}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                <a key={link.label} href={link.href}
                  className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                  {link.label}
                  {link.badge && (
                    <span className="text-[9px] font-semibold text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5 ml-0.5">{link.badge}</span>
                  )}
                </a>
              )
            ))}
          </nav>

          {/* Desktop right */}
          <div className="hidden lg:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <span className="text-xs text-muted-foreground">{user?.name || user?.email}</span>
                <Link to="/compliance">
                  <Button variant="default" size="sm" className="gap-1.5">
                    Dashboard
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Sign In</Button>
                </Link>
                <Link to="/signup">
                  <Button variant="default" size="sm" className="gap-1.5">
                    Get Started
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)}
            className="flex lg:hidden items-center justify-center size-9 rounded-lg border hover:bg-muted/50 transition-colors"
            aria-label="Toggle menu">
            {mobileOpen ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t bg-background lg:hidden">
            <div className="px-6 py-4 space-y-1">
              {navLinks.map((link) => (
                link.external ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                    {link.label} <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <a key={link.label} href={link.href} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground rounded-lg hover:bg-muted/50 transition-colors">
                    {link.label}
                    {link.badge && <span className="text-[9px] font-semibold text-muted-foreground/60 bg-muted rounded-full px-1.5 py-0.5">{link.badge}</span>}
                  </a>
                )
              ))}
            </div>
            <div className="border-t px-6 py-4 space-y-2">
              {isAuthenticated ? (
                <Link to="/compliance" onClick={() => setMobileOpen(false)}>
                  <Button variant="default" className="w-full gap-1.5">
                    Dashboard <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileOpen(false)}>
                    <Button variant="outline" className="w-full">Sign In</Button>
                  </Link>
                  <Link to="/signup" onClick={() => setMobileOpen(false)}>
                    <Button variant="default" className="w-full gap-1.5">
                      Get Started <ArrowRight className="size-3.5" />
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ════════════════════════════════════════
          HERO
          ════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 pt-16 pb-20 md:pt-20 md:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground mb-5">
                <Sparkles className="size-3 text-primary" />
                AI-Powered Compliance Automation
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-5xl font-semibold tracking-tight text-foreground leading-tight">
                AI-Powered Compliance Automation for Modern Organizations
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
                Automatically scan policies, detect regulatory gaps, assign reviews, and maintain audit-ready documentation across GDPR, HIPAA, SOC 2, ISO 27001, and PCI DSS.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link to={isAuthenticated ? "/documents" : "/signup"}>
                  <Button variant="default" size="lg" className="gap-2 text-sm h-11 px-6">
                    Start Scanning Documents
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
                <Link to="/compliance">
                  <Button variant="outline" size="lg" className="gap-2 text-sm h-11 px-6">
                    View Demo
                    <Eye className="size-4" />
                  </Button>
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" />
                  No credit card
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" />
                  Free trial
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-3.5 text-success" />
                  Enterprise-ready
                </div>
              </div>
            </div>

            {/* Right — Dashboard mockup */}
            <div className="relative">
              <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-b from-primary/[0.03] to-transparent rounded-3xl" />
              <div className="relative">
                <DashboardMockup />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          TRUST — Supported Frameworks
          ════════════════════════════════════════ */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center mb-6">
            Supported Compliance Frameworks
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {["GDPR", "HIPAA", "SOC 2", "ISO 27001", "PCI DSS"].map((fw) => (
              <FrameworkBadge key={fw} name={fw} />
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FEATURES
          ════════════════════════════════════════ */}
      <section id="features" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="Everything you need for compliance"
            subtitle="A complete platform for AI-powered document analysis, regulatory gap detection, and audit-ready reporting."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={Zap}
              title="AI Compliance Scanning"
              description="Automatically analyze documents using LLM-powered compliance evaluation against regulatory frameworks."
            />
            <FeatureCard
              icon={Layers}
              title="Multi-Framework Validation"
              description="Validate documents against multiple regulations in a single scan. Find gaps across all frameworks at once."
            />
            <FeatureCard
              icon={FileText}
              title="Evidence-Based Findings"
              description="Each finding includes matched text, confidence scores, source evidence, and AI-generated remediation suggestions."
            />
            <FeatureCard
              icon={ClipboardCheck}
              title="Review Workflow"
              description="Assign reviewers, manage approvals, request fixes, and maintain a complete audit history for every finding."
            />
            <FeatureCard
              icon={GitBranch}
              title="Version Tracking"
              description="Compare document versions side by side and monitor compliance score improvements over time."
            />
            <FeatureCard
              icon={Activity}
              title="Audit Trail"
              description="Maintain complete audit logs of every compliance decision, review action, and document change."
            />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          HOW IT WORKS
          ════════════════════════════════════════ */}
      <section id="solutions" className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="From document to audit-ready in 7 steps"
            subtitle="A streamlined compliance pipeline that turns policies into provable audit evidence."
          />
          <div className="max-w-3xl mx-auto">
            <StepCard number={1} title="Upload Document" description="Upload policies, procedures, and compliance documents in PDF or DOCX format." />
            <StepCard number={2} title="AI Scan" description="LLM-powered analysis extracts clauses, identifies regulatory context, and maps content to frameworks." />
            <StepCard number={3} title="Compliance Analysis" description="Documents are evaluated against GDPR, HIPAA, SOC 2, ISO 27001, and PCI DSS rules." />
            <StepCard number={4} title="Human Review" description="Compliance findings are routed to designated reviewers for structured investigation and sign-off." />
            <StepCard number={5} title="Remediation" description="AI suggests fixes for non-compliant findings. Teams update documents and re-submit for validation." />
            <StepCard number={6} title="Re-scan" description="Updated documents are re-analyzed to verify remediation and track score improvements." />
            <StepCard number={7} title="Audit Ready" description="All findings, evidence, reviews, and version history are packaged into audit-ready reports." last />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SCREENSHOT 1 — Dashboard
          ════════════════════════════════════════ */}
      <section id="compliance" className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Compliance Dashboard</p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                Gain instant visibility into organizational compliance health.
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                See your overall compliance score, framework health, open findings, and review queue — all in one place. Track improvements over time and identify areas that need attention.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Real-time compliance score with trend tracking",
                  "Framework-by-framework health breakdown",
                  "Document-level compliance status and scores",
                  "Quick access to review queue and findings",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-b from-primary/[0.02] to-transparent rounded-3xl" />
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SCREENSHOT 2 — Document Explorer
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-last lg:order-first relative">
              <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-b from-primary/[0.02] to-transparent rounded-3xl" />
              <DocumentExplorerMockup />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Document Explorer</p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                Manage policies, versions, and compliance scores in one place.
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                A centralized document repository with compliance scores, framework tags, version history, and search. Quickly find documents that need attention.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Search and filter across all documents",
                  "Compliance score per document with visual indicators",
                  "Version history with score tracking",
                  "Framework assignment and batch operations",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SCREENSHOT 3 — Review Queue
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Review Queue</p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                Collaborate with reviewers using structured compliance workflows.
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Review findings in a structured three-panel layout. Filter by status, severity, and framework. Investigate evidence, assign reviewers, and take action — all in one view.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Three-column investigation workspace",
                  "Filter by severity, framework, and status",
                  "AI confidence scoring and evidence review",
                  "Approve, dismiss, or request fixes",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-x-4 -inset-y-4 bg-gradient-to-b from-primary/[0.02] to-transparent rounded-3xl" />
              <ReviewQueueMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SCREENSHOT 4 — Investigation Workspace
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-last lg:order-first">
              <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
                <div className="flex items-center gap-1.5 px-4 py-3 border-b bg-muted/20">
                  <div className="size-2.5 rounded-full bg-destructive/60" />
                  <div className="size-2.5 rounded-full bg-warning/60" />
                  <div className="size-2.5 rounded-full bg-success/60" />
                  <span className="ml-4 text-[10px] font-medium text-foreground">Investigation — Data Retention Policy</span>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-destructive">Critical Finding</span>
                          <span className="text-[10px] text-muted-foreground">AI Confidence 94%</span>
                        </div>
                        <p className="text-xs text-foreground font-medium">GDPR Article 5(1)(e) — Data retention period not defined</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Section 4.2 states data is stored indefinitely without specifying retention periods or deletion schedules.</p>
                      </div>
                      <div className="rounded-lg bg-muted/20 border p-2.5">
                        <span className="text-[10px] font-semibold text-muted-foreground">EVIDENCE</span>
                        <p className="text-[11px] font-mono text-foreground/70 mt-1">&ldquo;...personal data shall be retained for the duration of the business relationship...&rdquo;</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Page 12 · Chunk #47</p>
                      </div>
                    </div>
                    <div className="w-36 shrink-0 space-y-1.5">
                      <div className="rounded-lg border bg-success/5 p-2 text-center">
                        <span className="text-[10px] text-success font-semibold">Compliant</span>
                      </div>
                      <div className="rounded-lg border bg-warning/5 p-2 text-center">
                        <span className="text-[10px] text-warning font-semibold">Partial</span>
                      </div>
                      <div className="rounded-lg border bg-destructive/5 p-2 text-center">
                        <span className="text-[10px] text-destructive font-semibold">Non-Compliant</span>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/20 border p-2.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-muted-foreground">RECOMMENDATION:</span>
                    <span className="text-[11px] text-foreground/70">Add a data retention schedule specifying deletion timelines per data category.</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-3">Compliance Workspace</p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                Understand why regulations pass or fail with AI-powered evidence.
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                Every compliance finding includes the exact matched text, page reference, confidence score, and an AI-generated recommendation. Investigate findings, assign reviewers, and track resolution.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "AI identifies non-compliant clauses with exact references",
                  "Source evidence with page numbers and chunk IDs",
                  "Severity-based prioritization and risk scoring",
                  "Clear pass/fail/partial status per compliance rule",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <CheckCircle2 className="size-4 text-success shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          WHY REGULENS AI — Comparison
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="Why ReguLens AI?"
            subtitle="Traditional compliance is slow, manual, and error-prone. ReguLens AI automates the heavy lifting."
          />
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-card p-6">
                <h3 className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <span className="text-lg">✕</span> Manual Compliance
                </h3>
                <ComparisonRow label="Analysis" manual="Manual document review" ai="" />
                <ComparisonRow label="Frameworks" manual="Single regulation at a time" ai="" />
                <ComparisonRow label="Accuracy" manual="Prone to human error" ai="" />
                <ComparisonRow label="Tracking" manual="Spreadsheets and email" ai="" />
                <ComparisonRow label="Audits" manual="Painful evidence gathering" ai="" />
              </div>
              <div className="rounded-xl border bg-primary/5 border-primary/10 p-6">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-success" /> ReguLens AI
                </h3>
                <ComparisonRow label="Analysis" manual="" ai="AI-powered document analysis" />
                <ComparisonRow label="Frameworks" manual="" ai="Multi-framework scanning" />
                <ComparisonRow label="Accuracy" manual="" ai="Evidence-based findings" />
                <ComparisonRow label="Tracking" manual="" ai="Centralized review workflows" />
                <ComparisonRow label="Audits" manual="" ai="Audit-ready reports" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          COMPLIANCE WORKFLOW DIAGRAM
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="Enterprise Compliance Workflow"
            subtitle="End-to-end compliance lifecycle from upload to audit readiness."
          />
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { icon: FileText, title: "Employee Uploads Policy", description: "Team members upload policies and procedures documents." },
                { icon: Zap, title: "AI Compliance Engine", description: "LLM analyzes documents against regulatory frameworks." },
                { icon: AlertTriangle, title: "Violation Detection", description: "Non-compliant clauses flagged with evidence references." },
                { icon: Users, title: "Compliance Manager", description: "Manager reviews findings and assigns to reviewers." },
                { icon: Eye, title: "Reviewer Investigation", description: "Reviewer examines evidence and determines resolution." },
                { icon: ClipboardCheck, title: "Needs Fix / Approve", description: "Reviewer requests fixes or approves the finding." },
                { icon: FileText, title: "Updated Document", description: "Employee updates document to address the finding." },
                { icon: CheckCircle2, title: "Resolved", description: "Re-scanned and verified. Ready for audit." },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border bg-card p-4 text-center hover:shadow-sm transition-shadow">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/5 mx-auto mb-3">
                    <item.icon className="size-4.5 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold text-foreground">{item.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2 mt-6 text-xs text-muted-foreground">
              <ArrowRight className="size-3" />
              Typical cycle: 24-48 hours
              <ArrowRight className="size-3" />
            </div>
          </div>
        </div>
      </section>



      {/* ════════════════════════════════════════
          AI CAPABILITIES
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28 bg-muted/30 border-y">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="AI Capabilities"
            subtitle="Enterprise-grade AI purpose-built for compliance analysis."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl mx-auto">
            <CapabilityCard icon={Zap} title="LLM-Powered Analysis" description="State-of-the-art language models analyze documents against regulatory frameworks with high accuracy." />
            <CapabilityCard icon={BookOpen} title="Rule-Based Validation" description="Structured compliance rules validate each clause against specific regulatory requirements." />
            <CapabilityCard icon={FileText} title="Evidence Extraction" description="Automatically extract and cite exact text passages that support or violate compliance rules." />
            <CapabilityCard icon={BarChart3} title="Confidence Scoring" description="Every finding includes an AI confidence score, helping reviewers prioritize their investigation." />
            <CapabilityCard icon={Sparkles} title="Remediation Suggestions" description="AI generates specific remediation recommendations for each non-compliant finding." />
            <CapabilityCard icon={Layers} title="Multi-Model Fallback" description="Automatic fallback between models ensures reliability and consistent analysis quality." />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SECURITY
          ════════════════════════════════════════ */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-6">
          <SectionHeader
            title="Enterprise-ready security"
            subtitle="Your compliance data is protected with industry-standard security controls."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <SecurityItem icon={Users} title="Role-Based Access Control" description="Granular permissions for Admin, Manager, Reviewer, and Contributor roles." />
            <SecurityItem icon={Activity} title="Audit Logs" description="Complete audit trail of every action, review decision, and document change." />
            <SecurityItem icon={GitBranch} title="Version Control" description="Full version history with compliance score tracking for every document." />
            <SecurityItem icon={Lock} title="Secure Authentication" description="JWT-based authentication with secure password hashing and session management." />
            <SecurityItem icon={Shield} title="Document Encryption" description="Documents encrypted at rest and in transit. Secure file storage and access controls." />
            <SecurityItem icon={Eye} title="Review Guardrails" description="Human-in-the-loop review ensures no compliance decision is made without oversight." />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          CTA
          ════════════════════════════════════════ */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-20 text-center">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
            Ready to modernize compliance?
          </h2>
          <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
            Start scanning documents today and see how AI-powered compliance automation can transform your audit readiness.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to={isAuthenticated ? "/documents" : "/signup"}>
              <Button variant="default" size="lg" className="gap-2 text-sm h-11 px-6">
                Start Scanning Documents
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/compliance">
              <Button variant="outline" size="lg" className="gap-2 text-sm h-11 px-6">
                Explore Dashboard
                <ExternalLink className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════ */}
      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="col-span-2 md:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-3">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary">
                  <Shield className="size-4 text-primary-foreground" />
                </div>
                <span className="text-sm font-bold text-foreground">ReguLens AI</span>
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
                AI-powered compliance automation platform. Scan documents, detect gaps, and maintain audit-ready compliance.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product</h4>
              <div className="space-y-2">
                {["Features", "Compliance", "Pricing", "Documentation"].map((item) => (
                  <a key={item} href="#" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{item}</a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Company</h4>
              <div className="space-y-2">
                {["About", "Blog", "Careers", "Contact", "GitHub"].map((item) => (
                  <a key={item} href="#" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{item}</a>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Legal</h4>
              <div className="space-y-2">
                {["Privacy Policy", "Terms of Service", "Security", "Cookies"].map((item) => (
                  <a key={item} href="#" className="block text-xs text-muted-foreground hover:text-foreground transition-colors">{item}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} ReguLens AI. All rights reserved.</p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Built for enterprise compliance teams.</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
