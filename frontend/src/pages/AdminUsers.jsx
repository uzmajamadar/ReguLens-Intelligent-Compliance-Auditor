import { useState, useEffect, useMemo } from "react";
import { useToast } from "../hooks/use-toast";
import {
  listUsers, createUser, updateUser, deleteUser,
  listDocuments, listReviewTasks, getAdminStats,
} from "../lib/api";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { KpiCard } from "../components/shared/KpiCard";
import { EmptyState } from "../components/shared/EmptyState";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import {
  Plus, Users, UserCheck, Shield, Loader2, Search, Mail,
  Trash2, X, Check, FileText, Clock, MoreHorizontal, Edit3,
} from "lucide-react";
import { cn } from "../lib/utils";

const ROLES = [
  { value: "admin", label: "Administrator",
    description: "Full system access. Manage organization settings, users and regulations." },
  { value: "compliance_manager", label: "Manager",
    description: "Assign reviews, monitor compliance, approve resolutions and view reports." },
  { value: "reviewer", label: "Reviewer",
    description: "Review assigned compliance findings, approve, reject or request fixes." },
  { value: "document_owner", label: "Contributor",
    description: "Upload documents, view own documents, fix violations and upload new versions." },
];

const ROLE_STYLE = {
  admin: "text-purple-700 bg-purple-50 border-purple-200",
  compliance_manager: "text-blue-700 bg-blue-50 border-blue-200",
  reviewer: "text-emerald-700 bg-emerald-50 border-emerald-200",
  document_owner: "text-gray-600 bg-gray-50 border-gray-200",
};

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-violet-500", "bg-teal-500",
];

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(id) {
  return AVATAR_COLORS[(id ?? 0) % AVATAR_COLORS.length];
}

function getRoleStyle(value) {
  return ROLE_STYLE[value] || ROLE_STYLE.document_owner;
}

function getRoleLabel(value) {
  const found = ROLES.find((r) => r.value === value);
  return found ? found.label : value;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(dateStr);
}

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewCounts, setReviewCounts] = useState({});
  const [docCounts, setDocCounts] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "document_owner" });
  const [submitting, setSubmitting] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [usersData, statsData, tasksData, docsData] = await Promise.all([
        listUsers(),
        getAdminStats().catch(() => null),
        listReviewTasks("").catch(() => []),
        listDocuments().catch(() => []),
      ]);
      setUsers(usersData);
      setStats(statsData);

      const rCounts = {};
      for (const t of Array.isArray(tasksData) ? tasksData : []) {
        const uid = t.assigned_to_id;
        if (uid != null) rCounts[uid] = (rCounts[uid] || 0) + 1;
      }
      setReviewCounts(rCounts);

      const dCounts = {};
      for (const d of Array.isArray(docsData) ? docsData : []) {
        const uid = d.user_id;
        if (uid != null) dCounts[uid] = (dCounts[uid] || 0) + 1;
      }
      setDocCounts(dCounts);
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createUser(form);
      toast({ title: "Member invited" });
      setShowCreate(false);
      setForm({ name: "", email: "", password: "", role: "document_owner" });
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(userId) {
    if (!editRole) return;
    setSubmitting(true);
    try {
      await updateUser(userId, { role: editRole });
      toast({ title: "Role updated" });
      setEditingId(null);
      setEditRole("");
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(userId, userName) {
    if (!window.confirm(`Deactivate "${userName}"? They will lose access to the organization.`)) return;
    try {
      await deleteUser(userId);
      toast({ title: "Member deactivated" });
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  function startEdit(user) {
    setEditingId(user.id);
    setEditRole(user.role);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditRole("");
  }

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (!showInactive && !u.is_active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!u.name?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [users, roleFilter, showInactive, searchQuery]);

  const statsCards = stats ? [
    { icon: Users, label: "Total Members", value: stats.total_users ?? 0 },
    { icon: UserCheck, label: "Active", value: stats.active_users ?? 0, trend: stats.total_users ? Math.round(((stats.active_users ?? 0) / stats.total_users) * 100) : 0, trendLabel: "of total" },
    { icon: Shield, label: "Admins", value: stats.admin_users ?? 0 },
    { icon: FileText, label: "Pending Reviews", value: stats.pending_reviews ?? 0 },
  ] : [];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
      {/* ── Header ───────────────────────────────────────────────── */}
      <PageHeader title="Organization Members" description="Manage team members, roles, and access permissions.">
        <Button onClick={() => setShowCreate(true)} className="gap-1.5 h-9">
          <Plus className="size-4" />
          Invite Member
        </Button>
      </PageHeader>

      {/* ── KPI Cards ─────────────────────────────────────────────── */}
      {statsCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* ── Invite Member Modal ───────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border bg-card shadow-2xl p-6 mx-4">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Invite Team Member</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Send an invitation to join your organization.</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-name">Full Name</Label>
                <Input id="create-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email Address</Label>
                <Input id="create-email" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-password">Temporary Password</Label>
                <Input id="create-password" required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set an initial password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-role">Role</Label>
                <select id="create-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  {ROLES.find((r) => r.value === form.role)?.description}
                </p>
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting} size="sm" className="gap-1.5">
                  {submitting && <Loader2 className="size-3.5 animate-spin" />}
                  {submitting ? "Inviting..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Filters ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          {["all", ...ROLES.map((r) => r.value)].map((val) => {
            const label = val === "all" ? "All" : ROLES.find((r) => r.value === val)?.label;
            return (
              <button key={val} onClick={() => setRoleFilter(val)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  roleFilter === val
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search members..."
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none shrink-0 ml-auto">
          <input type="checkbox" checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-input size-3.5" />
          Show inactive
        </label>
      </div>

      {/* ── Members Table ─────────────────────────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          {filteredUsers.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={Users}
                title="No members found"
                description={searchQuery || roleFilter !== "all" ? "Try adjusting your filters." : "Invite your first team member to get started."}
              />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-5 py-3.5 font-medium text-[11px] uppercase tracking-wider">User</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider">Last Active</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider text-center">Reviews</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider text-center">Docs</th>
                  <th className="px-4 py-3.5 font-medium text-[11px] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isEditing = editingId === u.id;
                  const reviewCount = reviewCounts[u.id] ?? "—";
                  const docCount = docCounts[u.id] ?? "—";
                  return (
                    <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                      {/* User (Avatar + Name + Email) */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className={cn("flex size-9 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0", getAvatarColor(u.id))}>
                            {getInitials(u.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Role */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        ) : (
                          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium", getRoleStyle(u.role))}>
                            {getRoleLabel(u.role)}
                          </span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge variant={u.is_active ? "active" : "inactive"}>
                          {u.is_active ? "Active" : "Inactive"}
                        </StatusBadge>
                      </td>
                      {/* Last Active */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className="size-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">{timeAgo(u.created_at)}</span>
                        </div>
                      </td>
                      {/* Reviews */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          reviewCount !== "—" && reviewCount > 0 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {reviewCount}
                        </span>
                      </td>
                      {/* Documents */}
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "text-sm font-semibold",
                          docCount !== "—" && docCount > 0 ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {docCount}
                        </span>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => handleEdit(u.id)} disabled={submitting}
                              className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition">
                              {submitting ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                              Save
                            </button>
                            <button onClick={cancelEdit}
                              className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition">
                              <X className="size-3" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => startEdit(u)}
                              className="flex items-center gap-1 h-7 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition"
                              title="Edit role">
                              <Edit3 className="size-3" />
                              Edit
                            </button>
                            {u.is_active && (
                              <button onClick={() => handleDeactivate(u.id, u.name)}
                                className="flex items-center gap-1 h-7 px-2 text-xs font-medium text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition"
                                title="Deactivate user">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* ── Permission Summary ─────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">Permission Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium text-[11px] uppercase tracking-wider w-28"></th>
                  {ROLES.map((r) => (
                    <th key={r.value} className="px-4 py-2.5 text-center font-medium text-[11px] uppercase tracking-wider">{r.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { action: "Documents", admin: "All", manager: "All", reviewer: "Assigned", document_owner: "Own" },
                  { action: "Review", admin: <Check className="size-3.5 text-success" />, manager: <Check className="size-3.5 text-success" />, reviewer: <Check className="size-3.5 text-success" />, document_owner: <X className="size-3.5 text-muted-foreground" /> },
                  { action: "Users", admin: <Check className="size-3.5 text-success" />, manager: <X className="size-3.5 text-muted-foreground" />, reviewer: <X className="size-3.5 text-muted-foreground" />, document_owner: <X className="size-3.5 text-muted-foreground" /> },
                  { action: "Reports", admin: <Check className="size-3.5 text-success" />, manager: <Check className="size-3.5 text-success" />, reviewer: <X className="size-3.5 text-muted-foreground" />, document_owner: <X className="size-3.5 text-muted-foreground" /> },
                ].map((p) => (
                  <tr key={p.action} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-foreground font-medium text-xs">{p.action}</td>
                    {ROLES.map((r) => (
                      <td key={r.value} className="px-4 py-2.5 text-center text-muted-foreground text-xs">{p[r.value]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
