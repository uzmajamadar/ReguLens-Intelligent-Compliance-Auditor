import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, User, Shield, Key, Loader2, CheckCircle2, AlertCircle, Users, LayoutDashboard, ClipboardList, ExternalLink, Bot, Mail, MessageSquare, Palette, ArrowRight } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { updateProfile, getOrganization, updateOrganization } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Separator } from "../components/ui/separator";
import { PageHeader } from "../components/shared/PageHeader";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);

  useEffect(() => {
    if (hasRole("admin")) {
      getOrganization()
        .then((org) => setOrgName(org.name))
        .catch(() => {})
        .finally(() => setOrgLoading(false));
    }
  }, [hasRole]);

  async function handleSaveOrg(e) {
    e.preventDefault();
    if (!orgName.trim()) return;
    setOrgSaving(true);
    try {
      await updateOrganization(orgName.trim());
      toast({ title: "Organization updated" });
    } catch {
      toast({ title: "Failed to update organization", variant: "destructive" });
    } finally {
      setOrgSaving(false);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ name });
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast({ title: "Please fill in all password fields", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ current_password: currentPassword, password: newPassword });
      toast({ title: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      toast({ title: "Failed to change password", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const adminLinks = [
    { to: "/admin", label: "Admin Dashboard", icon: LayoutDashboard, description: "System overview and statistics" },
    { to: "/admin/users", label: "User Management", icon: Users, description: "Manage user accounts and roles" },
    { to: "/admin/audit-logs", label: "Audit Logs", icon: ClipboardList, description: "View system audit trail" },
  ];

  function SectionHeader({ title, description }) {
    return (
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    );
  }

  function PlaceholderCard({ icon: Icon, title, description, badge }) {
    return (
      <div className="rounded-xl border bg-card p-5">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/5 text-primary mb-3">
          <Icon className="size-4" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        {badge && (
          <div className="mt-3">
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6 space-y-10">
      <PageHeader title="Settings" description="Manage your account and preferences" />

      {/* ── Account ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Account" description="Manage your profile and security" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <User className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Profile</h3>
                  <p className="text-xs text-muted-foreground">Your personal information</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback className="text-base font-bold uppercase bg-primary/10 text-primary">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground">{user?.name || "User"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <span className="mt-0.5 inline-block rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                    {user?.role}
                  </span>
                </div>
              </div>
              <Separator />
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={user?.email || ""} disabled className="bg-muted/50" />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="size-4 animate-spin" />}
                  Save Changes
                </Button>
              </form>
            </div>
          </div>

          <div className="rounded-xl border bg-card">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <Key className="size-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Security</h3>
                  <p className="text-xs text-muted-foreground">Update your password</p>
                </div>
              </div>
            </div>
            <form onSubmit={handleChangePassword} className="p-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
              </div>
              <Button type="submit" disabled={saving} variant="outline" className="gap-2">
                {saving && <Loader2 className="size-4 animate-spin" />}
                Change Password
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* ── Workspace ─────────────────────────────────── */}
      {hasRole("admin") && (
        <section>
          <SectionHeader title="Workspace" description="Manage your organization and team" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card">
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <Building2 className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Organization</h3>
                    <p className="text-xs text-muted-foreground">Your organization details</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleSaveOrg} className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                    placeholder={orgLoading ? "Loading..." : "Your organization name"}
                    disabled={orgLoading} />
                </div>
                <Button type="submit" disabled={orgSaving || orgLoading} className="gap-2">
                  {orgSaving && <Loader2 className="size-4 animate-spin" />}
                  Save Organization
                </Button>
              </form>
            </div>

            <button
              onClick={() => navigate("/admin/users")}
              className="rounded-xl border bg-card p-5 text-left hover:bg-muted/30 transition-colors group"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 mb-3">
                <Users className="size-4" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Members</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Manage user roles, access permissions, and team membership.</p>
              <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
                Manage Members <ArrowRight className="size-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          </div>
        </section>
      )}

      {/* ── Integrations ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Integrations" description="Connect external services and tools" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlaceholderCard
            icon={Bot}
            title="AI Providers"
            description="Configure AI models for compliance scanning, remediation, and document analysis."
            badge="Coming soon"
          />
          <PlaceholderCard
            icon={Mail}
            title="Email"
            description="Set up email notifications for review requests, status changes, and compliance alerts."
            badge="Coming soon"
          />
          <PlaceholderCard
            icon={MessageSquare}
            title="Slack"
            description="Connect Slack for real-time compliance alerts, review assignments, and team notifications."
            badge="Coming soon"
          />
        </div>
      </section>

      {/* ── Compliance ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Compliance" description="Configure frameworks and API access" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PlaceholderCard
            icon={Shield}
            title="Frameworks"
            description="Enable and configure compliance frameworks for automated document scanning and validation."
            badge="Coming soon"
          />
          <PlaceholderCard
            icon={Key}
            title="API Keys"
            description="Generate and manage API keys for programmatic access to the compliance engine."
            badge="Coming soon"
          />
        </div>
      </section>

      {/* ── Preferences ─────────────────────────────────── */}
      <section>
        <SectionHeader title="Preferences" description="Customize your experience" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PlaceholderCard
            icon={Palette}
            title="Appearance"
            description="Customize the look and feel of the application to match your brand."
            badge="Coming soon"
          />
        </div>
      </section>

      {/* ── Administration ─────────────────────────────────── */}
      {hasRole("admin") && (
        <section>
          <SectionHeader title="Administration" description="System management tools" />
          <div className="rounded-xl border bg-card divide-y divide-border">
            {adminLinks.map(({ to, label, icon: Icon, description }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <ExternalLink className="size-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
