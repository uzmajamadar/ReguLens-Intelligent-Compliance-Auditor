import { useState, useEffect } from "react";
import { useToast } from "../hooks/use-toast";
import { listUsers, createUser, updateUser, deleteUser } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Plus, Shield, UserCheck, UserX, Trash2, Loader2 } from "lucide-react";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "compliance_manager", label: "Compliance Manager" },
  { value: "reviewer", label: "Reviewer" },
  { value: "employee", label: "Employee" },
  { value: "auditor", label: "Auditor" },
];

const roleBadgeVariant = {
  admin: "default",
  compliance_manager: "info",
  reviewer: "success",
  employee: "secondary",
  auditor: "warning",
};

function getRoleVariant(role) {
  return roleBadgeVariant[role] || "secondary";
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "employee" });
  const [editForm, setEditForm] = useState({ role: "", is_active: true });
  const [submitting, setSubmitting] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const { toast } = useToast();

  function load() {
    setLoading(true);
    listUsers().then(setUsers).catch((err) => toast({ title: "Error", description: err.message, variant: "destructive" })).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createUser(form);
      toast({ title: "User created" });
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "employee" });
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(userId) {
    setSubmitting(true);
    try {
      await updateUser(userId, editForm);
      toast({ title: "User updated" });
      setEditingId(null);
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(userId, userName) {
    if (!window.confirm(`Deactivate user "${userName}"?`)) return;
    try {
      await deleteUser(userId);
      toast({ title: "User deactivated" });
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setEditForm({ role: user.role, is_active: user.is_active });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1">{users.length} user{users.length !== 1 ? "s" : ""} in your organization</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 h-10 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition text-sm font-medium"
        >
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <div className="flex items-center gap-2">
        {["all", "admin", "compliance_manager", "reviewer", "employee"].map((r) => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              roleFilter === r
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            }`}>
            {r === "all" ? "All" : r.replace("_", " ")}
          </button>
        ))}
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-semibold text-foreground mb-4">Create New User</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="create-name">Name</Label>
                  <Input id="create-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-email">Email</Label>
                  <Input id="create-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-password">Password</Label>
                  <Input id="create-password" required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="create-role">Role</Label>
                  <select id="create-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="h-10 px-4 text-sm font-medium text-muted-foreground hover:text-foreground transition">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="h-10 px-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition text-sm font-medium flex items-center gap-2">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground font-medium">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.filter((u) => roleFilter === "all" || u.role === roleFilter).map((u) => (
                <tr key={u.id} className="border-b hover:bg-muted/50 transition">
                  <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        className="h-8 px-2 rounded-lg border border-input bg-background text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    ) : (
                      <Badge variant={getRoleVariant(u.role)}>{u.role}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingId === u.id ? (
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={editForm.is_active}
                          onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                          className="rounded border-input" />
                        {editForm.is_active ? "Active" : "Inactive"}
                      </label>
                    ) : (
                      <span className={`flex items-center gap-1 text-xs ${u.is_active ? "text-green-600" : "text-destructive"}`}>
                        {u.is_active ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === u.id ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => handleEdit(u.id)} disabled={submitting}
                          className="h-8 px-3 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(u)}
                          className="h-8 px-3 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(u.id, u.name)}
                          className="h-8 px-2 text-muted-foreground hover:text-destructive transition">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
