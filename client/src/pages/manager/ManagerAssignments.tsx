import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { departmentLabels, familyLabels, scenarioFamilies } from "@/features/simulator/config";
import { Loader2, Plus, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const departmentOptions = [
  { value: "customer_service", label: departmentLabels.customer_service },
  { value: "golf", label: departmentLabels.golf },
  { value: "mod_emergency", label: departmentLabels.mod_emergency },
] as const;

export default function ManagerAssignments() {
  const utils = trpc.useUtils();
  const assignments = trpc.assignments.teamAssignments.useQuery({}, { retry: false });
  const team = trpc.team.myTeam.useQuery(undefined, { retry: false });
  const createMutation = trpc.assignments.create.useMutation({
    onSuccess: () => { utils.assignments.teamAssignments.invalidate(); toast.success("Assignment created"); setOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: "",
    scenarioFamily: scenarioFamilies.customer_service[0],
    department: departmentOptions[0].value as typeof departmentOptions[number]["value"],
    difficultyMin: 3,
    difficultyMax: 5,
    requiredAttempts: 1,
    dueDate: "",
    notes: "",
  });

  const handleCreate = () => {
    if (!form.employeeId) { toast.error("Select an employee"); return; }
    createMutation.mutate({
      employeeId: parseInt(form.employeeId),
      scenarioFamily: form.scenarioFamily,
      department: form.department,
      title: `${form.scenarioFamily.replace(/_/g, " ")} drill`,
      difficultyMin: form.difficultyMin,
      difficultyMax: form.difficultyMax,
      requiredAttempts: form.requiredAttempts,
      dueDate: form.dueDate || undefined,
      notes: form.notes || undefined,
    });
  };

  if (assignments.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  if (assignments.isError || team.isError) {
    return (
      <Card className="bg-card border-red-500/20">
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-red-400 text-sm">Assignments or team members could not be loaded.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => assignments.refetch()}>Retry Assignments</Button>
            <Button variant="outline" onClick={() => team.refetch()}>Retry Team</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const items = assignments.data || [];
  const members = team.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assignments</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} assignment{items.length !== 1 ? "s" : ""}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal text-slate-deep hover:bg-teal/90 gap-2">
              <Plus className="h-4 w-4" /> New Assignment
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle>Create Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs">Employee</Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                  <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m: any) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.name || `User ${m.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Scenario Family</Label>
                  <Select value={form.scenarioFamily} onValueChange={(v) => setForm({ ...form, scenarioFamily: v })}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(scenarioFamilies[form.department] || []).map((f) => (
                        <SelectItem key={f} value={f}>{familyLabels[f] || f.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              <div>
                <Label className="text-xs">Department</Label>
                <Select
                  value={form.department}
                  onValueChange={(v) => {
                    const department = v as typeof departmentOptions[number]["value"];
                    setForm({
                      ...form,
                      department,
                      scenarioFamily: scenarioFamilies[department][0],
                    });
                  }}
                >
                  <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Min Difficulty</Label>
                  <Input type="number" min={1} max={5} value={form.difficultyMin} onChange={(e) => setForm({ ...form, difficultyMin: parseInt(e.target.value) || 1 })} className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs">Max Difficulty</Label>
                  <Input type="number" min={1} max={5} value={form.difficultyMax} onChange={(e) => setForm({ ...form, difficultyMax: parseInt(e.target.value) || 5 })} className="bg-background border-border" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Required Attempts</Label>
                  <Input type="number" min={1} max={10} value={form.requiredAttempts} onChange={(e) => setForm({ ...form, requiredAttempts: parseInt(e.target.value) || 1 })} className="bg-background border-border" />
                </div>
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="bg-background border-border" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Focus on de-escalation..." className="bg-background border-border" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending} className="bg-teal text-slate-deep hover:bg-teal/90">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No assignments created yet. Use this page to assign the next drill after session review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((a: any) => {
            const isOverdue = a.dueDate && new Date(a.dueDate) < new Date() && a.status !== "completed";
            return (
              <div key={a.id} className="panel p-4 flex items-center gap-4">
                <div className={`w-2 h-8 rounded-full ${a.status === "completed" ? "bg-green-500" : isOverdue ? "bg-red-500" : "bg-amber-500"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{a.employeeName || `Employee #${a.employeeId}`}</div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {familyLabels[a.scenarioFamily || ""] || (a.scenarioFamily || "").replace(/_/g, " ")} · Difficulty {a.difficultyMin}–{a.difficultyMax} · {a.requiredAttempts} attempt{a.requiredAttempts > 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.dueDate && (
                    <span className={`text-xs ${isOverdue ? "text-red-400" : "text-muted-foreground"}`}>
                      Due {new Date(a.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <Badge variant="outline" className={`text-[10px] border-0 ${
                    a.status === "completed" ? "text-green-400 bg-green-500/10" :
                    isOverdue ? "text-red-400 bg-red-500/10" :
                    "text-amber-400 bg-amber-500/10"
                  }`}>
                    {isOverdue ? "Overdue" : a.status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
