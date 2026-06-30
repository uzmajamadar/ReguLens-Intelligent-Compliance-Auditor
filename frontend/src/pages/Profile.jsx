import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { updateProfile } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Separator } from "../components/ui/separator";
import { Mail, Loader2 } from "lucide-react";

const roleLabels = {
  admin: "Admin",
  compliance_manager: "Compliance Manager",
  reviewer: "Reviewer",
  employee: "Employee",
  auditor: "Auditor",
};

export default function Profile() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data = {};
      if (name !== user?.name) data.name = name;
      if (newPassword) {
        data.current_password = currentPassword;
        data.new_password = newPassword;
      }
      if (Object.keys(data).length === 0) {
        toast({ title: "Nothing to update" });
        return;
      }
      const updated = await updateProfile(data);
      toast({ title: "Profile updated" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      login(user?.email + "__force", currentPassword || "dummy").catch(() => {
        window.location.reload();
      });
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account settings</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4 pb-4 border-b">
            <Avatar className="w-16 h-16 text-2xl">
              <AvatarFallback className="bg-primary/10 text-primary">{user?.name?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{user?.name}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Mail className="w-3.5 h-3.5" />
                {user?.email}
              </div>
              <Badge variant="secondary" className="mt-1">{roleLabels[user?.role] || user?.role}</Badge>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <Separator />
            <h3 className="text-sm font-semibold text-foreground">Change Password</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={submitting}
                className="h-10 px-6 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium flex items-center gap-2">
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
