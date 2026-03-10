import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";
import {
  activeAssignmentStatuses,
  clampDifficulty,
  familyLabels,
  normalizeDepartmentKey,
} from "@/features/simulator/config";
import { toast } from "sonner";
import { usePracticeLaunch } from "@/features/simulator/usePracticeLaunch";

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  assigned: { label: "Assigned", color: "text-amber-400 bg-amber-500/10", icon: Clock },
  pending: { label: "Pending", color: "text-amber-400 bg-amber-500/10", icon: Clock },
  in_progress: { label: "In Progress", color: "text-teal bg-teal/10", icon: ArrowRight },
  completed: { label: "Completed", color: "text-green-400 bg-green-500/10", icon: CheckCircle },
  overdue: { label: "Overdue", color: "text-red-400 bg-red-500/10", icon: AlertTriangle },
};

export default function EmployeeAssignments() {
  const { isStarting, startPractice } = usePracticeLaunch();
  const assignments = trpc.assignments.myAssignments.useQuery(undefined, { retry: false });
  const startAssignment = trpc.assignments.start.useMutation();

  const handleStart = async (a: any) => {
    const department = normalizeDepartmentKey(a.department);
    const difficultyMin = clampDifficulty(a.difficultyMin || 3);
    const difficultyMax = clampDifficulty(a.difficultyMax || difficultyMin, difficultyMin, 5);

    try {
      await startAssignment.mutateAsync({ id: a.id });
    } catch (error: any) {
      toast.error(error.message || "Unable to start assignment");
      return;
    }

    startPractice({
      department,
      difficulty: difficultyMin,
      mode: "in-person",
      scenarioFamily: a.scenarioFamily || undefined,
      scenarioTemplateId: a.scenarioTemplateId || undefined,
      assignmentId: a.id,
      assignmentTitle: a.title || undefined,
      difficultyMin,
      difficultyMax,
    });
  };

  if (assignments.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (assignments.isError) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
        <div className="pt-4">
          <h1 className="text-lg font-semibold">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">Drills assigned by your manager</p>
        </div>
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-red-400">Assignments could not be loaded.</p>
            <Button variant="outline" className="w-full" onClick={() => assignments.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = assignments.data || [];
  const pending = items.filter((a: any) => activeAssignmentStatuses.has(a.status));
  const completed = items.filter((a: any) => a.status === "completed");

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
      <div className="pt-4">
        <h1 className="text-lg font-semibold">Assignments</h1>
        <p className="text-sm text-muted-foreground mt-1">Drills assigned by your manager</p>
      </div>

      {items.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle className="h-10 w-10 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">No assignments yet. Start practice from Home or Practice while you wait for the next drill.</p>
          </CardContent>
        </Card>
      )}

      {/* Active Assignments */}
      {pending.length > 0 && (
        <div>
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Active</div>
          <div className="space-y-2">
            {pending.map((a: any) => {
              const sc = statusConfig[a.status] || statusConfig.pending;
              const StatusIcon = sc.icon;
              const dueDate = a.dueDate ? new Date(a.dueDate) : null;
              const isOverdue = dueDate && dueDate < new Date() && a.status !== "completed";
              return (
                <div key={a.id} className="panel p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{a.title || familyLabels[a.scenarioFamily] || "General Practice"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Difficulty {a.difficultyMin}–{a.difficultyMax} · {a.requiredAttempts} attempt{a.requiredAttempts > 1 ? "s" : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className={`${isOverdue ? statusConfig.overdue.color : sc.color} text-[10px] border-0`}>
                      <StatusIcon className="h-3 w-3 mr-1" />
                      {isOverdue ? "Overdue" : sc.label}
                    </Badge>
                  </div>
                  {dueDate && (
                    <div className="text-[10px] text-muted-foreground mb-2">
                      Due: {dueDate.toLocaleDateString()}
                    </div>
                  )}
                  {a.notes && (
                    <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-2 mb-2">{a.notes}</div>
                  )}
                  <Button
                    onClick={() => void handleStart(a)}
                    size="sm"
                    disabled={startAssignment.isPending || isStarting}
                    className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-1 h-9"
                  >
                    {startAssignment.isPending || isStarting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Start Drill"}
                    {!startAssignment.isPending && !isStarting && <ArrowRight className="h-3 w-3" />}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Completed</div>
          <div className="space-y-2">
            {completed.map((a: any) => (
              <div key={a.id} className="panel p-3 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="text-sm">{a.title || familyLabels[a.scenarioFamily] || "General Practice"}</div>
                  <Badge variant="outline" className="text-green-400 bg-green-500/10 text-[10px] border-0">
                    <CheckCircle className="h-3 w-3 mr-1" /> Done
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
