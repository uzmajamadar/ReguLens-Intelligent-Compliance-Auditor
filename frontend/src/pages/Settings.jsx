import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, User, Shield, Key, Loader2, CheckCircle2, AlertCircle, Users, LayoutDashboard, ClipboardList, ExternalLink } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { updateProfile, getOrganization, updateOrganization } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Separator } from "../components/ui/separator";

export default function Settings() {
  const { user, hasRole } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
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
      toast({ title: "Please fill in both password fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ current_password: currentPassword, password: newPassword });
      toast({ title: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
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

  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Manage your account and preferences
        </p>
      </div>

      <div className="space-y-8">
        {/* Profile Section */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-6 py-5">
            <div className="flex items-center gap-4">
              <Avatar className="size-14">
                <AvatarFallback className="text-lg font-bold uppercase bg-primary/10 text-primary">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-lg font-semibold text-foreground">{user?.name || "User"}</h2>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                <span className="mt-1 inline-block rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                  {user?.role}
                </span>
              </div>
            </div>
          </div>
          <Separator />
          <form onSubmit={handleSaveProfile} className="px-6 py-5 space-y-4">
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

        {/* Password Section */}
        <div className="rounded-xl border border-border bg-card">
          <div className="px-6 py-5 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Key className="size-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Password</h2>
                <p className="text-xs text-muted-foreground">Update your password</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleChangePassword} className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter new password" />
            </div>
            <Button type="submit" disabled={saving} variant="outline" className="gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </div>

        {/* Organization Section */}
        {hasRole("admin") && (
          <div className="rounded-xl border border-border bg-card">
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Building2 className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Organization</h2>
                  <p className="text-xs text-muted-foreground">Manage your organization details</p>
                </div>
              </div>
            </div>
            <form onSubmit={handleSaveOrg} className="px-6 py-5 space-y-4">
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
        )}

        {/* Admin Section */}
        {hasRole("admin") && (
          <div className="rounded-xl border border-border bg-card">
            <div className="px-6 py-5 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <Shield className="size-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Administration</h2>
                  <p className="text-xs text-muted-foreground">System management tools</p>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border">
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
          </div>
        )}
      </div>
    </div>
  );
}
