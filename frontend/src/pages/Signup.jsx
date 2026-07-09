import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Eye, EyeOff, ShieldCheck, CheckCircle2, Lock } from "lucide-react";

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", orgName: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          organization_name: form.orgName || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Registration failed" }));
        throw new Error(err.detail || "Registration failed");
      }
      await login(form.email, form.password);
      toast({ title: "Account created!", description: "Welcome to ReguLens AI." });
      navigate("/onboarding", { replace: true });
    } catch (err) {
      toast({ title: "Registration failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-background">
      {/* Brand Side Panel */}
      <div className="hidden lg:flex lg:col-span-5 bg-linear-to-br from-slate-900 via-slate-950 to-blue-950 text-white flex-col justify-between p-12 relative overflow-hidden border-r border-border/10">
        <div className="absolute inset-0 bg-[radial-gradient(800px_circle_at_20%_100%,rgba(59,130,246,0.12),transparent_60%)]" />
        
        {/* Brand Header */}
        <Link to="/" className="flex items-center gap-3 relative z-10">
          <div className="size-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shadow-sm">
            <ShieldCheck className="size-5 text-blue-400" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">ReguLens</span>
        </Link>

        {/* Feature List */}
        <div className="my-auto space-y-8 relative z-10">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
              <Lock className="size-3" /> Quick Compliance Scan
            </span>
            <h2 className="text-3xl font-bold tracking-tight leading-tight text-white">
              Get audited in less than three minutes.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              Create an organization account and start uploading security documents, privacy policies, or employee guidelines right away.
            </p>
          </div>

          <div className="space-y-4 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-4.5 text-blue-400 shrink-0 mt-0.5" />
              <span>Multi-framework audits (GDPR, SOC2, HIPAA, ISO27001)</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-4.5 text-blue-400 shrink-0 mt-0.5" />
              <span>Automatic step-by-step onboarding wizard for teams</span>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-4.5 text-blue-400 shrink-0 mt-0.5" />
              <span>Contextual AI agent conversations about findings</span>
            </div>
          </div>
        </div>

        {/* Brand Footer */}
        <div className="relative z-10">
          <p className="text-xs text-slate-500 leading-relaxed">
            &copy; 2026 ReguLens AI Inc. All rights reserved. Secure RAG operations audited annually.
          </p>
        </div>
      </div>

      {/* Signup Form Panel */}
      <div className="lg:col-span-7 flex items-center justify-center p-6 sm:p-12 bg-linear-to-b from-slate-50/50 to-blue-50/20 dark:from-background dark:to-slate-950/20">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:text-left space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Create your organization</h1>
            <p className="text-sm text-muted-foreground">Set up your workspace and begin compliance validation.</p>
          </div>

          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    required
                    value={form.orgName}
                    onChange={(e) => setForm({ ...form, orgName: e.target.value })}
                    placeholder="Acme Corp"
                    autoFocus
                    className="h-9.5 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name">Your Name</Label>
                  <Input
                    id="name"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="John Doe"
                    className="h-9.5 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Work Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@company.com"
                    className="h-9.5 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Create a strong password"
                      className="h-9.5 text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 px-4 mt-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm shadow-primary/25 hover:shadow-primary/45"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                    </>
                  ) : (
                    "Create Workspace"
                  )}
                </button>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  Already have an account?{" "}
                  <Link to="/login" className="text-primary font-semibold hover:underline">
                    Sign in
                  </Link>
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}