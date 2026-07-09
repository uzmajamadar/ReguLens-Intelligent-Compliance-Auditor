import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { listWorkflowTasks, actOnWorkflowTask } from "../lib/api";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
import { CheckCircle, XCircle, RefreshCw, Loader2 } from "lucide-react";

export default function WorkflowTasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [notes, setNotes] = useState({});
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "pending");

  function load() {
    setLoading(true);
    listWorkflowTasks({ status: statusFilter === "all" ? undefined : statusFilter })
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function handleAction(taskId, status) {
    setActionLoading(taskId);
    try {
      await actOnWorkflowTask(taskId, status, notes[taskId] || "");
      toast({ title: `Task ${status}`, description: `Task has been ${status}.` });
      setNotes((prev) => ({ ...prev, [taskId]: "" }));
      load();
    } catch (err) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Tasks</h1>
        <p className="text-muted-foreground mt-1">Review and act on your assigned workflow tasks</p>
      </div>

      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="changes_requested">Changes Requested</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground">No tasks found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {statusFilter === "pending"
                ? "You have no pending tasks. Great job!"
                : `No tasks with status "${statusFilter}".`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-foreground">{task.step_name || "Task"}</h3>
                      <Badge variant={task.status === "approved" ? "success" : task.status === "rejected" ? "destructive" : task.status === "changes_requested" ? "info" : "warning"}>
                        {task.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Instance #{task.instance_id}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>

                {task.status === "pending" && (
                  <div className="mt-4 space-y-3">
                    <Textarea
                      placeholder="Add notes (optional)..."
                      value={notes[task.id] || ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAction(task.id, "approved")}
                        disabled={actionLoading === task.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {actionLoading === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleAction(task.id, "rejected")}
                        disabled={actionLoading === task.id}
                        variant="destructive"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </Button>
                      <Button
                        onClick={() => handleAction(task.id, "changes_requested")}
                        disabled={actionLoading === task.id}
                        variant="default"
                      >
                        <RefreshCw className="w-4 h-4" /> Request Changes
                      </Button>
                    </div>
                  </div>
                )}

                {task.notes && task.status !== "pending" && (
                  <div className="mt-3 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
                    <p className="font-medium text-xs text-muted-foreground/60 mb-1">Notes:</p>
                    {task.notes}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
