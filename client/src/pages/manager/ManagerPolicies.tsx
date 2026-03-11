import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { departmentLabels, familyLabels } from "@/features/simulator/config";

const departmentOptions = [
  { value: "all", label: "All Departments" },
  { value: "customer_service", label: departmentLabels.customer_service },
  { value: "golf", label: departmentLabels.golf },
  { value: "mod_emergency", label: departmentLabels.mod_emergency },
] as const;

export default function ManagerPolicies() {
  const utils = trpc.useUtils();
  const [departmentFilter, setDepartmentFilter] = useState<(typeof departmentOptions)[number]["value"]>("all");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    department: "none" as "none" | Exclude<(typeof departmentOptions)[number]["value"], "all">,
    scenarioFamilies: "",
    content: "",
  });

  const queryInput = departmentFilter === "all" ? {} : { department: departmentFilter };
  const policies = trpc.policies.list.useQuery(queryInput, { retry: false });
  const createMutation = trpc.policies.create.useMutation({
    onSuccess: () => {
      toast.success("Policy created");
      setOpen(false);
      setForm({ title: "", department: "none", scenarioFamilies: "", content: "" });
      utils.policies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.policies.update.useMutation({
    onSuccess: () => {
      toast.success("Policy updated");
      closeEditor();
      utils.policies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const toggleMutation = trpc.policies.activate.useMutation({
    onSuccess: () => {
      toast.success("Policy updated");
      utils.policies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const deleteMutation = trpc.policies.remove.useMutation({
    onSuccess: () => {
      toast.success("Policy removed");
      setDeleteTarget(null);
      utils.policies.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  function closeEditor() {
    setOpen(false);
    setEditingPolicyId(null);
    setForm({ title: "", department: "none", scenarioFamilies: "", content: "" });
  }

  function openCreate() {
    setEditingPolicyId(null);
    setForm({ title: "", department: "none", scenarioFamilies: "", content: "" });
    setOpen(true);
  }

  function openEdit(policy: any) {
    setEditingPolicyId(policy.id);
    setForm({
      title: policy.title,
      department: policy.department ?? "none",
      scenarioFamilies: Array.isArray(policy.scenarioFamilies) ? policy.scenarioFamilies.join(", ") : "",
      content: policy.content,
    });
    setOpen(true);
  }

  function submitPolicy() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and policy content are required");
      return;
    }

    const payload = {
      title: form.title.trim(),
      department: form.department === "none" ? undefined : form.department,
      scenarioFamilies: form.scenarioFamilies
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      content: form.content.trim(),
    };

    if (editingPolicyId) {
      updateMutation.mutate({ id: editingPolicyId, ...payload });
      return;
    }

    createMutation.mutate(payload);
  }

  if (policies.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  if (policies.isError) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-red-400 text-sm">Failed to load policy documents. Admin access is required.</p>
        </CardContent>
      </Card>
    );
  }

  const data = policies.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Policy Documents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.length} polic{data.length !== 1 ? "ies" : "y"} available for policy grounding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={departmentFilter} onValueChange={(value) => setDepartmentFilter(value as (typeof departmentOptions)[number]["value"])}>
            <SelectTrigger className="w-52 bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {departmentOptions.map((department) => (
                <SelectItem key={department.value} value={department.value}>
                  {department.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openCreate} className="bg-teal text-slate-deep hover:bg-teal/90 gap-2">
            <Plus className="h-4 w-4" />
            New Policy
          </Button>
        </div>
      </div>

      {data.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No policy documents found for this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((policy: any) => (
            <div key={policy.id} className={`panel p-4 ${!policy.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-amber" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium">{policy.title}</span>
                    <Badge variant="outline" className="text-[10px] border-0 text-muted-foreground bg-secondary/50">
                      v{policy.version}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] border-0 ${policy.isActive ? "text-green-400 bg-green-500/10" : "text-muted-foreground bg-secondary/50"}`}>
                      {policy.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {policy.department ? departmentLabels[policy.department as keyof typeof departmentLabels] : "All departments"}
                  </div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                    {policy.content}
                  </p>
                  {Array.isArray(policy.scenarioFamilies) && policy.scenarioFamilies.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      {policy.scenarioFamilies.map((family: string) => (
                        <Badge key={family} variant="outline" className="text-[10px] border-border/60 text-muted-foreground">
                          {familyLabels[family] || family.replace(/_/g, " ")}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(policy)}
                    className="border-border text-muted-foreground hover:text-foreground gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteTarget({ id: policy.id, title: policy.title })}
                    className="border-red-500/30 text-red-300 hover:text-red-200 hover:border-red-400/40 gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                  <span className="text-xs text-muted-foreground">Active</span>
                  <Switch
                    checked={policy.isActive}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: policy.id, isActive: checked })}
                    disabled={toggleMutation.isPending}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setOpen(true);
          return;
        }
        closeEditor();
      }}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPolicyId ? "Edit Policy Document" : "Create Policy Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="Front desk refunds and credits"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs">Department</Label>
              <Select value={form.department} onValueChange={(value) => setForm({ ...form, department: value as typeof form.department })}>
                <SelectTrigger className="bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">All Departments</SelectItem>
                  {departmentOptions.filter((option) => option.value !== "all").map((department) => (
                    <SelectItem key={department.value} value={department.value}>
                      {department.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Scenario Families</Label>
              <Input
                value={form.scenarioFamilies}
                onChange={(event) => setForm({ ...form, scenarioFamilies: event.target.value })}
                placeholder="billing_confusion, refund_credit_request, member_complaint"
                className="bg-background border-border"
              />
            </div>
            <div>
              <Label className="text-xs">Policy Content</Label>
              <Textarea
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                placeholder="Describe the approved policy, required steps, and escalation rules."
                className="bg-background border-border min-h-48"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              onClick={submitPolicy}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-teal text-slate-deep hover:bg-teal/90"
            >
              {createMutation.isPending || updateMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : editingPolicyId ? "Save Policy" : "Create Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>Remove Policy</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Remove <span className="text-foreground font-medium">{deleteTarget?.title}</span> from the policy library.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
