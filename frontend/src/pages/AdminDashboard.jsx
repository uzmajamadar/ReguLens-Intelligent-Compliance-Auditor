import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Users, FileText, Shield, Clock, Activity, UserCog, ClipboardList } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { getAdminStats } from "../lib/api";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";
import { EmptyState } from "../components/shared/EmptyState";
import { SkeletonTable } from "../components/shared/SkeletonTable";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive p-4">Error loading stats: {error}</div>;
  }

  const cards = [
    { label: "Total Users", value: stats?.total_users ?? 0, icon: Users, color: "bg-blue-500" },
    { label: "Active Users", value: stats?.active_users ?? 0, icon: Activity, color: "bg-green-500" },
    { label: "Documents", value: stats?.total_documents ?? 0, icon: FileText, color: "bg-purple-500" },
    { label: "Total Scans", value: stats?.total_scans ?? 0, icon: Shield, color: "bg-indigo-500" },
    { label: "Pending Reviews", value: stats?.pending_reviews ?? 0, icon: Clock, color: "bg-amber-500" },
    { label: "Admin Users", value: stats?.admin_users ?? 0, icon: UserCog, color: "bg-rose-500" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" description="Overview of your organization" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <KpiCard key={label} icon={Icon} label={label} value={value} />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition" onClick={() => navigate("/admin/users")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-foreground">User Management</h3>
            </div>
            <p className="text-sm text-muted-foreground">Create, edit, and manage users in your organization</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition" onClick={() => navigate("/admin/audit-logs")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-purple-500 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-foreground">Audit Logs</h3>
            </div>
            <p className="text-sm text-muted-foreground">View all activity and changes in your organization</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
