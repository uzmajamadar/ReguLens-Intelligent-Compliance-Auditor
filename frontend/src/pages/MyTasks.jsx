import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileText, ChevronRight, Loader2, Calendar, User, CheckCircle2 } from "lucide-react";
import { listMyTasks } from "../lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MyTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listMyTasks();
        if (!cancelled) setTasks(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto w-full px-6 py-12 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents that need your attention
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2 mb-4">
          <AlertTriangle className="size-4 shrink-0" /> {error}
        </div>
      )}

      {tasks.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <CheckCircle2 className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No pending tasks. You're all caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((doc) => (
            <Card key={doc.document_id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <AlertTriangle className="size-5 text-amber-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-semibold">
                        {doc.original_filename}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doc.pending_count} change{doc.pending_count > 1 ? "s" : ""} requested
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    v{doc.version_number}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {doc.pending_tasks.map((task) => (
                    <div
                      key={task.task_id}
                      className="flex items-center justify-between rounded-lg bg-muted/30 border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{task.rule_name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <FileText className="size-3" /> {task.framework}
                          </span>
                          {task.assigned_to && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="size-3" /> {task.assigned_to}
                            </span>
                          )}
                          {task.created_at && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="size-3" /> {new Date(task.created_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/documents/${doc.document_id}?tab=compliance`)}
                        className="shrink-0 gap-1"
                      >
                        Fix <ChevronRight className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                {doc.notes && (
                  <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">
                    Note: {doc.notes}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
