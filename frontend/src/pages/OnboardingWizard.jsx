import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2, Building2, UserPlus, Users, PartyPopper, Check } from "lucide-react";

const STEPS = [
  { title: "Name your organization", icon: Building2 },
  { title: "Add another admin", icon: UserPlus },
  { title: "Invite your team", icon: Users },
  { title: "You're all set!", icon: PartyPopper },
];

export default function OnboardingWizard() {
  const { user, hasRole } = useAuth();
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
          toast({ title: "Please enter an organization name", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        await fetch("/api/admin/organization", {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}` },
          body: JSON.stringify({ name: orgName.trim() }),
        });
      }

      if (step === 1) {
        if (!adminName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
          toast({ title: "Please fill in all admin fields", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}` },
          body: JSON.stringify({ name: adminName.trim(), email: adminEmail.trim(), password: adminPassword, role: "admin" }),
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
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("regulens_token")}` },
            body: JSON.stringify({ name: member.name.trim(), email: member.email.trim(), password: "Welcome123!", role: member.role }),
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4">
      <div className="w-full max-w-lg">
        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition ${
                i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary/10 text-primary border-2 border-primary" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <Check className="size-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && <div className={`w-8 h-0.5 transition ${i < step ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-8">
          {/* Step 0: Org Name */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-4">
                  <Building2 className="size-7" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Name your organization</h1>
                <p className="text-sm text-muted-foreground mt-1">This will be displayed across your workspace</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="onboard-org">Organization Name</Label>
                <Input id="onboard-org" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Corp" autoFocus />
              </div>
            </div>
          )}

          {/* Step 1: Add another admin */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-purple-50 text-purple-600 mb-4">
                  <UserPlus className="size-7" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Add another admin</h1>
                <p className="text-sm text-muted-foreground mt-1">Invite a co-admin to help manage your organization</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="jane@company.com" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Temporary password" />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Invite team */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-xl bg-green-50 text-green-600 mb-4">
                  <Users className="size-7" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Invite your team</h1>
                <p className="text-sm text-muted-foreground mt-1">Add reviewers and compliance managers (optional)</p>
              </div>

              <div className="space-y-4">
                {team.map((member, i) => (
                  <div key={i} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Team Member {i + 1}</span>
                      {team.length > 1 && (
                        <button onClick={() => removeTeamMember(i)} className="text-xs text-destructive hover:underline">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Name</Label>
                        <Input className="h-9 text-xs" value={member.name} onChange={(e) => updateTeamMember(i, "name", e.target.value)} placeholder="Name" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input className="h-9 text-xs" type="email" value={member.email} onChange={(e) => updateTeamMember(i, "email", e.target.value)} placeholder="Email" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Role</Label>
                        <select value={member.role} onChange={(e) => updateTeamMember(i, "role", e.target.value)}
                          className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs">
                          <option value="reviewer">Reviewer</option>
                          <option value="compliance_manager">Compliance Mgr</option>
                          <option value="employee">Employee</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={addTeamMember} className="text-sm text-primary hover:underline">+ Add another person</button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <div className="space-y-6 text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <PartyPopper className="size-8" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">You're all set!</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {orgName && <span>Your organization <strong>{orgName}</strong> is ready.</span>}
                  {createdCount > 0 && <span> {createdCount} team member{createdCount !== 1 ? "s" : ""} invited.</span>}
                </p>
              </div>
              <div className="space-y-3 pt-2">
                <button onClick={() => navigate("/storage", { replace: true })}
                  className="w-full h-10 px-4 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition">
                  Upload your first document
                </button>
                <button onClick={skipAndFinish}
                  className="w-full h-10 px-4 text-sm text-muted-foreground hover:text-foreground transition">
                  Go to Compliance Dashboard
                </button>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          {step < 3 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <button onClick={skipAndFinish} className="text-sm text-muted-foreground hover:text-foreground transition">
                Skip for now
              </button>
              <button onClick={handleNext} disabled={submitting}
                className="h-10 px-6 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-2">
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {step === 2 ? "Finish" : "Continue"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}