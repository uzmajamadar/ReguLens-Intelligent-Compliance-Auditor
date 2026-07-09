import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/use-toast";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Loader2, Building2, UserPlus, Users, PartyPopper, Check, ArrowRight } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";

const STEPS = [
  { title: "Organization", icon: Building2, subtitle: "Name your workspace" },
  { title: "Co-Admin", icon: UserPlus, subtitle: "Add secondary administrator" },
  { title: "Team Members", icon: Users, subtitle: "Invite your team" },
  { title: "Get Started", icon: PartyPopper, subtitle: "All systems ready" },
];

export default function OnboardingWizard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [team, setTeam] = useState([{ name: "", email: "", role: "reviewer" }]);
  const [createdCount, setCreatedCount] = useState(0);

  async function handleNext() {
    setSubmitting(true);
    try {
      if (step === 0) {
        if (!orgName.trim()) {
          toast({ title: "Validation error", description: "Please enter an organization name.", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        await fetch("/api/admin/organization", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}`
          },
          body: JSON.stringify({ name: orgName.trim() }),
        });
      }

      if (step === 1) {
        if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
          toast({ title: "Validation error", description: "Please fill in all admin fields.", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}`
          },
          body: JSON.stringify({
            name: adminName.trim(),
            email: adminEmail.trim(),
            password: adminPassword,
            role: "admin"
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || "Failed to create admin");
        }
      }

      if (step === 2) {
        let count = 0;
        for (const member of team) {
          if (!member.name.trim() || !member.email.trim()) continue;
          const res = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}`
            },
            body: JSON.stringify({
              name: member.name.trim(),
              email: member.email.trim(),
              password: "Welcome123!",
              role: member.role
            }),
          });
          if (res.ok) count++;
        }
        setCreatedCount(count);
      }

      if (step < 3) {
        setStep((s) => s + 1);
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function skipAndFinish() {
    navigate("/compliance", { replace: true });
  }

  function addTeamMember() {
    setTeam([...team, { name: "", email: "", role: "reviewer" }]);
  }

  function updateTeamMember(i, field, value) {
    const next = [...team];
    next[i] = { ...next[i], [field]: value };
    setTeam(next);
  }

  function removeTeamMember(i) {
    setTeam(team.filter((_, idx) => idx !== i));
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-radial-gradient(1200px_circle_at_50%_50%,rgba(59,130,246,0.06),transparent_60%) bg-slate-50 dark:bg-slate-950/20 px-4 py-12">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Progress Header */}
        <div className="flex items-center justify-between px-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Workspace Setup</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step + 1} of {STEPS.length} &middot; {STEPS[step].title}</p>
          </div>
          {step < 3 && (
            <button
              onClick={skipAndFinish}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Skip Setup &middot; Go to Dashboard
            </button>
          )}
        </div>

        {/* Custom Stepper Indicators */}
        <div className="grid grid-cols-4 gap-2 bg-muted/40 p-1.5 rounded-2xl border border-border/50">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCompleted = i < step;
            const isActive = i === step;
            return (
              <div
                key={i}
                className={`flex flex-col items-center sm:items-start p-2.5 rounded-xl transition-all duration-300 ${
                  isActive ? "bg-background shadow-xs text-primary" : "text-muted-foreground/60"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-6.5 items-center justify-center rounded-lg text-[10px] font-bold ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : isActive
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {isCompleted ? <Check className="size-3.5" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline text-xs font-semibold text-foreground">{s.title}</span>
                </div>
                <span className="hidden sm:block text-[10px] text-muted-foreground/80 mt-1">{s.subtitle}</span>
              </div>
            );
          })}
        </div>

        {/* Wizard Main Card */}
        <Card className="border-border/60 bg-card shadow-sm">
          <CardContent className="pt-8 px-6 sm:px-8">
            {/* Step 0: Org Name */}
            {step === 0 && (
              <div className="space-y-6">
                <div className="text-center max-w-sm mx-auto space-y-2">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20 text-primary shadow-sm">
                    <Building2 className="size-6 animate-pulse" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Name your organization</h2>
                  <p className="text-xs text-muted-foreground">This name will represent your primary security boundaries and compliance records.</p>
                </div>
                <div className="space-y-2 max-w-md mx-auto">
                  <Label htmlFor="onboard-org">Organization Name</Label>
                  <Input
                    id="onboard-org"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="e.g. Acme Corporation"
                    autoFocus
                    className="h-10 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Step 1: Add Co-Admin */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-center max-w-sm mx-auto space-y-2">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 shadow-sm">
                    <UserPlus className="size-6 animate-pulse" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Add a Co-Administrator</h2>
                  <p className="text-xs text-muted-foreground">Invite another security owner to manage system integrations and audit policies.</p>
                </div>
                
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-name">Full Name</Label>
                    <Input
                      id="admin-name"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      placeholder="Jane Smith"
                      className="h-9.5 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-email">Email Address</Label>
                      <Input
                        id="admin-email"
                        type="email"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        placeholder="jane@company.com"
                        className="h-9.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-password">Temp Password</Label>
                      <Input
                        id="admin-password"
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        placeholder="••••••••"
                        className="h-9.5 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Invite Team Members */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="text-center max-w-sm mx-auto space-y-2">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 shadow-sm">
                    <Users className="size-6 animate-pulse" />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Invite your audit team</h2>
                  <p className="text-xs text-muted-foreground">Add security reviewers, compliance officers, and contributors to assign tasks.</p>
                </div>

                <div className="space-y-3 max-w-xl mx-auto overflow-y-auto max-h-60 pr-1">
                  {team.map((member, i) => (
                    <div key={i} className="rounded-xl border border-border/80 bg-background/50 p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Team Member {i + 1}</span>
                        {team.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTeamMember(i)}
                            className="text-xs text-destructive hover:underline font-semibold cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Name</Label>
                          <Input
                            className="h-9 text-xs"
                            value={member.name}
                            onChange={(e) => updateTeamMember(i, "name", e.target.value)}
                            placeholder="Name"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email</Label>
                          <Input
                            className="h-9 text-xs"
                            type="email"
                            value={member.email}
                            onChange={(e) => updateTeamMember(i, "email", e.target.value)}
                            placeholder="Email"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Workspace Role</Label>
                          <Select
                            value={member.role}
                            onValueChange={(value) => updateTeamMember(i, "role", value)}
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="reviewer">Reviewer</SelectItem>
                              <SelectItem value="compliance_manager">Compliance Manager</SelectItem>
                              <SelectItem value="document_owner">Contributor (Document Owner)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addTeamMember}
                    className="text-xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    + Add another person
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Complete Done Screen */}
            {step === 3 && (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 shadow-sm">
                  <PartyPopper className="size-7 animate-bounce" />
                </div>
                <div className="space-y-2 max-w-sm mx-auto">
                  <h2 className="text-xl font-bold text-foreground">You're all set!</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {orgName && (
                      <span>
                        Your organization <strong className="font-semibold text-foreground">{orgName}</strong> is created.
                      </span>
                    )}
                    {createdCount > 0 && (
                      <span>
                        {" "}{createdCount} team member{createdCount !== 1 ? "s" : ""} have been successfully invited.
                      </span>
                    )}
                  </p>
                </div>
                <div className="max-w-xs mx-auto space-y-2.5 pt-4">
                  <Button
                    onClick={() => navigate("/documents", { replace: true })}
                    className="w-full h-10 gap-1.5 shadow-sm shadow-primary/25 cursor-pointer"
                  >
                    Upload first document <ArrowRight className="size-4" />
                  </Button>
                  <Button
                    onClick={skipAndFinish}
                    variant="outline"
                    className="w-full h-10 cursor-pointer"
                  >
                    Go to Compliance Dashboard
                  </Button>
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            {step < 3 && (
              <div className="flex items-center justify-between mt-8 pt-5 border-t border-border/80">
                <button
                  type="button"
                  onClick={skipAndFinish}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Skip setup for now
                </button>
                <Button
                  onClick={handleNext}
                  disabled={submitting}
                  className="h-9.5 px-5 gap-1.5 shadow-xs cursor-pointer"
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {step === 2 ? "Finish" : "Continue"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}