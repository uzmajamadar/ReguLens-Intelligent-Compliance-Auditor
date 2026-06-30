import { useMemo } from "react";


import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, FileSearch2, Clock, LineChart, Bot, Lock, Zap } from "lucide-react";

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-5 backdrop-blur">
      <div className="absolute inset-0 bg-linear-to-br from-primary/25 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-start gap-4">
        <div className="mt-0.5 inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur">
      <div className="flex items-start gap-4">
        <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-secondary/70 text-foreground ring-1 ring-border">
          <Icon className="size-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function AccordionItem({ q, a, defaultOpen }) {
  const id = useMemo(() => `faq-${q.replace(/\s+/g, "-").toLowerCase()}`, [q]);
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 overflow-hidden">
      <input className="peer sr-only" type="checkbox" defaultChecked={defaultOpen} id={id} />
      <label htmlFor={id} className="flex cursor-pointer select-none items-center justify-between gap-4 p-5">
        <span className="font-semibold">{q}</span>
        <span className="text-muted-foreground peer-checked:rotate-180 transition-transform">⌄</span>
      </label>
      <div className="max-h-0 peer-checked:max-h-96 transition-[max-height] duration-300">
        <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{a}</div>
      </div>
    </div>
  );
}


export default function Landing() {
  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_20%_0%,rgba(59,130,246,0.18),transparent_55%),radial-gradient(900px_circle_at_100%_20%,rgba(217,70,239,0.18),transparent_50%),radial-gradient(800px_circle_at_0%_100%,rgba(16,185,129,0.12),transparent_55%)]">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center">
              <ShieldCheck className="size-5 text-primary" />
            </div>
            <div>
                <p className="font-semibold leading-none">ReguLens</p>
              <p className="text-xs text-muted-foreground">AI compliance copilot</p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/documents" className="text-sm text-muted-foreground hover:text-foreground transition">Documents</Link>
            <Link to="/compliance" className="text-sm text-muted-foreground hover:text-foreground transition">Compliance</Link>
            <Link to="/auditor-ai" className="text-sm text-muted-foreground hover:text-foreground transition">Auditor AI</Link>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition"
            >
              Sign in
            </Link>
            <Link
              to="/auditor-ai"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 hover:shadow-primary/40 transition"
            >
              Try the AI Auditor
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
            <div className="md:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-4 text-primary" />
                Built for policy-heavy teams · Explainable results
              </div>

              <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight">
                Turn documents into <span className="text-primary">auditable compliance</span> — in minutes.
              </h1>
              <p className="mt-4 text-base md:text-lg text-muted-foreground leading-relaxed">
                ReguLens ingests privacy/security documents, finds relevant policy rules, and helps you ask precise compliance questions.
                Designed to feel fast, confident, and recruiter-friendly.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/documents"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background shadow-sm hover:opacity-95 transition"
                >
                  Upload & analyze
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/compliance"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-card/60 px-5 py-3 text-sm font-semibold text-foreground hover:bg-card transition"
                >
                  See compliance results
                  <ShieldCheck className="size-4" />
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                <div className="inline-flex items-center gap-2 rounded-xl bg-card/60 border border-border/70 px-3 py-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Evidence-backed findings
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl bg-card/60 border border-border/70 px-3 py-2">
                  <Zap className="size-4 text-primary" />
                  Fast search + chat workflow
                </div>
                <div className="inline-flex items-center gap-2 rounded-xl bg-card/60 border border-border/70 px-3 py-2">
                  <Lock className="size-4 text-muted-foreground" />
                  Built for safe review
                </div>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="relative">
                <div className="absolute -inset-4 bg-linear-to-br from-primary/30 via-transparent to-transparent blur-2xl" />
                <div className="relative rounded-3xl border border-border/70 bg-card/60 backdrop-blur p-6 md:p-7">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
                      <p className="mt-1 text-lg font-semibold">Compliance summary</p>
                    </div>
                    <div className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
                      <span className="size-2 rounded-full bg-primary" />
                      Ready
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
                          <FileSearch2 className="size-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">Key clauses</p>
                          <p className="text-sm text-muted-foreground">Found 14 relevant sections with matching rules.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                          <ShieldCheck className="size-5 text-emerald-500" />
                        </div>
                        <div>
                          <p className="font-semibold">Risk highlights</p>
                          <p className="text-sm text-muted-foreground">3 potential gaps · prioritized by severity.</p>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="inline-flex size-10 items-center justify-center rounded-xl bg-indigo-500/10 ring-1 ring-indigo-500/20">
                          <Bot className="size-5 text-indigo-400" />
                        </div>
                        <div>
                          <p className="font-semibold">Ask the auditor</p>
                          <p className="text-sm text-muted-foreground">Chat answers reference policy logic and gaps.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Updated just now</div>
                    <div className="inline-flex items-center gap-2 rounded-xl bg-primary/10 ring-1 ring-primary/20 px-3 py-2 text-xs font-semibold">
                      <LineChart className="size-4 text-primary" />
                      Coverage: 92%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            <div className="md:col-span-12">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Recruiter-proof impact</h2>
              <p className="mt-2 text-muted-foreground">A compliance workflow that looks great in demos and performs well in real teams.</p>
            </div>

            <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard icon={Clock} label="Time to insight" value="~3 min" />
              <StatCard icon={ShieldCheck} label="Evidence mapping" value="Per-clauses" />
              <StatCard icon={LineChart} label="Confidence signals" value="Explainable" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-5">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">What ReguLens does</h2>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                End-to-end pipeline: ingest documents → detect relevant policy rules → present compliance insights → let users ask targeted questions.
              </p>
              <div className="mt-5 flex items-center gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-emerald-500" />
                Built with explainability in mind
              </div>
            </div>

            <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Feature icon={FileSearch2} title="Document ingestion" desc="Upload policy docs and extract structured content for analysis." />
              <Feature icon={ShieldCheck} title="Compliance rules" desc="Match against your policy rules engine and derive coverage/risk." />
              <Feature icon={Bot} title="Auditor AI chat" desc="Ask compliance questions with context-aware responses." />
              <Feature icon={Zap} title="Fast triage" desc="Quickly find gaps and prioritize what matters most." />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="rounded-4xl border border-border/70 bg-card/60 backdrop-blur p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">How it works</h2>
                <p className="mt-2 text-muted-foreground">A simple flow recruiters can understand in 30 seconds.</p>
              </div>
              <Link
                to="/auditor-ai"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-95 transition"
              >
                Jump to demo
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
              {[
                { n: "01", t: "Upload", d: "Drop in privacy/security docs." },
                { n: "02", t: "Extract", d: "Turn text into policy-aware signals." },
                { n: "03", t: "Analyze", d: "Find matches, gaps, and evidence." },
                { n: "04", t: "Chat", d: "Ask: “What’s missing?” and get answers." },
              ].map((s) => (
                <div key={s.n} className="rounded-2xl border border-border/70 bg-background/40 p-6">
                  <div className="text-xs font-semibold text-primary tracking-wide">{s.n}</div>
                  <div className="mt-2 text-lg font-semibold">{s.t}</div>
                  <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-5">
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">FAQ</h2>
              <p className="mt-2 text-muted-foreground">Quick answers for interview-style conversations.</p>
            </div>
            <div className="md:col-span-7 flex flex-col gap-4">
              <AccordionItem
                q="Is this legal advice?"
                a="No. The app provides informational compliance analysis and summaries. Always review findings with qualified professionals."
                defaultOpen
              />
              <AccordionItem
                q="How does it find relevant sections?"
                a="It ingests documents and uses embedding/search and rule logic to surface relevant clauses, then organizes results for review."
              />
              <AccordionItem
                q="What do I show in a recruiter demo?"
                a="Upload a sample policy, open Compliance to view coverage/gaps, then use Auditor AI to ask targeted “what’s missing?” questions."
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-14">
          <div className="rounded-4xl border border-border/70 bg-foreground text-background p-8 md:p-10 overflow-hidden relative">
            <div className="absolute inset-0 opacity-15">
              <div className="absolute -top-20 -left-10 size-72 rounded-full bg-primary blur-3xl" />
              <div className="absolute -bottom-20 -right-10 size-72 rounded-full bg-secondary blur-3xl" />
            </div>
            <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="max-w-xl">
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">Make compliance feel effortless.</h2>
                <p className="mt-3 text-background/80 leading-relaxed">
                  Start with documents you already have and walk away with a structured compliance story.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/documents"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-background px-5 py-3 text-sm font-semibold text-foreground hover:opacity-95 transition"
                >
                  Upload documents
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  to="/compliance"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-background/30 bg-transparent px-5 py-3 text-sm font-semibold text-background hover:bg-background/10 transition"
                >
                  View compliance
                  <ShieldCheck className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-5 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center">
                <ShieldCheck className="size-5 text-primary" />
              </div>
              <div>
              <p className="font-semibold leading-none">ReguLens</p>
                <p className="text-xs text-muted-foreground">AI compliance copilot</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Built to help teams understand compliance posture with fast, explainable analysis.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            <a className="rounded-xl border border-border/70 bg-card/60 px-4 py-2 hover:bg-card transition" href="#">
              Privacy
            </a>
            <a className="rounded-xl border border-border/70 bg-card/60 px-4 py-2 hover:bg-card transition" href="#">
              Security
            </a>
            <a className="rounded-xl border border-border/70 bg-card/60 px-4 py-2 hover:bg-card transition" href="#">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

