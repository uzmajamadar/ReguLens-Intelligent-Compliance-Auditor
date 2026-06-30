import { useState, useEffect } from "react";
import { listWorkflowInstances } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PlayCircle, CheckCircle, XCircle, Clock, FileText, Loader2 } from "lucide-react";

export default function WorkflowInstances() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  function load() {
    setLoading(true);
    listWorkflowInstances({ status: statusFilter || undefined })
      .then(setInstances)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  const statusBadge = {
    active: { label: "Active", variant: "warning" },
    completed: { label: "Completed", variant: "success" },
    cancelled: { label: "Cancelled", variant: "destructive" },
  };

  const stepBadge = { label: "Step", variant: "info" };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Workflow Instances</h1>
        <p className="text-muted-foreground mt-1">Track document review workflows across your organization</p>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
        <TabsList>
          <TabsTrigger value="">All</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : instances.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground">No workflows yet</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Workflows are automatically created when a document scan completes.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground font-medium">
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3">Workflow</th>
                  <th className="px-4 py-3">Current Step</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Completed</th>
                </tr>
              </thead>
              <tbody>
                {instances.map((inst) => {
                  const sb = statusBadge[inst.status] || statusBadge.active;
                  return (
                    <tr key={inst.id} className="border-b hover:bg-muted/50 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium text-foreground truncate max-w-[200px]">{inst.document_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{inst.workflow_name}</td>
                      <td className="px-4 py-3">
                        {inst.current_step_name ? (
                          <Badge variant="info">
                            {inst.current_step_name}
                            {inst.current_step_role && <span className="ml-1 opacity-70">({inst.current_step_role})</span>}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={sb.variant}>{sb.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(inst.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {inst.completed_at ? new Date(inst.completed_at).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
