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
import { Loader2, Plus, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { departmentLabels, familyLabels } from "@/features/simulator/config";

const departmentOptions = [
  { value: "all", label: "All Departments" },
  { value: "customer_service", label: departmentLabels.customer_service },
  { value: "golf", label: departmentLabels.golf },
  { value: "mod_emergency", label: departmentLabels.mod_emergency },
] as const;

const emotionalIntensityOptions = [
  { value: "low", label: "Low" },
  { value: "moderate", label: "Moderate" },
  { value: "high", label: "High" },
] as const;

const complexityOptions = [
  { value: "simple", label: "Simple" },
  { value: "mixed", label: "Mixed" },
  { value: "ambiguous", label: "Ambiguous" },
] as const;

export default function ManagerScenarios() {
  const utils = trpc.useUtils();
  const [departmentFilter, setDepartmentFilter] = useState<(typeof departmentOptions)[number]["value"]>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    department: "customer_service" as Exclude<(typeof departmentOptions)[number]["value"], "all">,
    scenarioFamily: "",
    targetRole: "Front Desk Associate",
    difficulty: 3,
    emotionalIntensity: "moderate" as (typeof emotionalIntensityOptions)[number]["value"],
    complexity: "mixed" as (typeof complexityOptions)[number]["value"],
    customerName: "",
    customerAgeBand: "",
    membershipContext: "",
    communicationStyle: "",
    initialEmotion: "",
    patienceLevel: "",
    situationSummary: "",
    openingLine: "",
    hiddenFacts: "",
    approvedResolutionPaths: "",
    requiredBehaviors: "",
    criticalErrors: "",
    recommendedTurns: 4,
  });

  const queryInput = departmentFilter === "all" ? {} : { department: departmentFilter };
  const scenarios = trpc.scenarios.list.useQuery(queryInput, { retry: false });
  const createMutation = trpc.scenarios.create.useMutation({
    onSuccess: () => {
      toast.success("Scenario created");
      setOpen(false);
      setForm({
        title: "",
        department: "customer_service",
        scenarioFamily: "",
        targetRole: "Front Desk Associate",
        difficulty: 3,
        emotionalIntensity: "moderate",
        complexity: "mixed",
        customerName: "",
        customerAgeBand: "",
        membershipContext: "",
        communicationStyle: "",
        initialEmotion: "",
        patienceLevel: "",
        situationSummary: "",
        openingLine: "",
        hiddenFacts: "",
        approvedResolutionPaths: "",
        requiredBehaviors: "",
        criticalErrors: "",
        recommendedTurns: 4,
      });
      utils.scenarios.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateMutation = trpc.scenarios.update.useMutation({
    onSuccess: () => {
      toast.success("Scenario updated");
      utils.scenarios.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (scenarios.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  if (scenarios.isError) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-red-400 text-sm">Failed to load scenarios. Admin access is required for management.</p>
        </CardContent>
      </Card>
    );
  }

  const data = scenarios.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Scenario Library</h1>
          <p className="text-sm text-muted-foreground mt-1">{data.length} scenario template{data.length !== 1 ? "s" : ""}</p>
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
          <Button onClick={() => setOpen(true)} className="bg-teal text-slate-deep hover:bg-teal/90 gap-2">
            <Plus className="h-4 w-4" />
            New Scenario
          </Button>
        </div>
      </div>

      {data.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No scenario templates found for this filter.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((scenario: any) => (
            <div key={scenario.id} className={`panel p-4 ${!scenario.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
                  <Zap className="h-5 w-5 text-teal" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium">{scenario.title}</span>
                    <Badge variant="outline" className="text-[10px] border-0 bg-secondary/50 text-muted-foreground">
                      {scenario.department ? departmentLabels[scenario.department as keyof typeof departmentLabels] : "Unknown department"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] border-0 bg-teal/10 text-teal">
                      Level {scenario.difficulty}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2 capitalize">
                    {familyLabels[scenario.scenarioFamily || ""] || (scenario.scenarioFamily || "").replace(/_/g, " ")} · {scenario.targetRole}
                  </div>
                  <p className="text-sm text-muted-foreground">{scenario.situationSummary}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Opening line: {scenario.openingLine}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{scenario.isActive ? "Active" : "Inactive"}</span>
                  <Switch
                    checked={scenario.isActive}
                    onCheckedChange={() => updateMutation.mutate({ id: scenario.id, isActive: !scenario.isActive })}
                    disabled={updateMutation.isPending}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Scenario Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Title</Label>
                <Input
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="Upset parent at front desk"
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs">Scenario Family</Label>
                <Input
                  value={form.scenarioFamily}
                  onChange={(event) => setForm({ ...form, scenarioFamily: event.target.value })}
                  placeholder="upset_parent"
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Department</Label>
                <Select value={form.department} onValueChange={(value) => setForm({ ...form, department: value as typeof form.department })}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.filter((option) => option.value !== "all").map((department) => (
                      <SelectItem key={department.value} value={department.value}>
                        {department.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Target Role</Label>
                <Input
                  value={form.targetRole}
                  onChange={(event) => setForm({ ...form, targetRole: event.target.value })}
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label className="text-xs">Difficulty</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={form.difficulty}
                  onChange={(event) => setForm({ ...form, difficulty: Math.max(1, Math.min(5, parseInt(event.target.value || "1", 10))) })}
                  className="bg-background border-border"
                />
              </div>
              <div>
                <Label className="text-xs">Emotion</Label>
                <Select value={form.emotionalIntensity} onValueChange={(value) => setForm({ ...form, emotionalIntensity: value as typeof form.emotionalIntensity })}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {emotionalIntensityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Complexity</Label>
                <Select value={form.complexity} onValueChange={(value) => setForm({ ...form, complexity: value as typeof form.complexity })}>
                  <SelectTrigger className="bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {complexityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Recommended Turns</Label>
                <Input
                  type="number"
                  min={2}
                  max={12}
                  value={form.recommendedTurns}
                  onChange={(event) => setForm({ ...form, recommendedTurns: Math.max(2, Math.min(12, parseInt(event.target.value || "4", 10))) })}
                  className="bg-background border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Customer Name</Label>
                <Input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className="bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs">Age Band</Label>
                <Input value={form.customerAgeBand} onChange={(event) => setForm({ ...form, customerAgeBand: event.target.value })} className="bg-background border-border" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Membership Context</Label>
                <Input value={form.membershipContext} onChange={(event) => setForm({ ...form, membershipContext: event.target.value })} className="bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs">Communication Style</Label>
                <Input value={form.communicationStyle} onChange={(event) => setForm({ ...form, communicationStyle: event.target.value })} className="bg-background border-border" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Initial Emotion</Label>
                <Input value={form.initialEmotion} onChange={(event) => setForm({ ...form, initialEmotion: event.target.value })} className="bg-background border-border" />
              </div>
              <div>
                <Label className="text-xs">Patience Level</Label>
                <Input value={form.patienceLevel} onChange={(event) => setForm({ ...form, patienceLevel: event.target.value })} className="bg-background border-border" />
              </div>
            </div>

            <div>
              <Label className="text-xs">Situation Summary</Label>
              <Textarea
                value={form.situationSummary}
                onChange={(event) => setForm({ ...form, situationSummary: event.target.value })}
                className="bg-background border-border"
              />
            </div>

            <div>
              <Label className="text-xs">Opening Line</Label>
              <Textarea
                value={form.openingLine}
                onChange={(event) => setForm({ ...form, openingLine: event.target.value })}
                className="bg-background border-border"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Hidden Facts</Label>
                <Textarea
                  value={form.hiddenFacts}
                  onChange={(event) => setForm({ ...form, hiddenFacts: event.target.value })}
                  placeholder="One per line"
                  className="bg-background border-border min-h-24"
                />
              </div>
              <div>
                <Label className="text-xs">Approved Resolution Paths</Label>
                <Textarea
                  value={form.approvedResolutionPaths}
                  onChange={(event) => setForm({ ...form, approvedResolutionPaths: event.target.value })}
                  placeholder="One per line"
                  className="bg-background border-border min-h-24"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Required Behaviors</Label>
                <Textarea
                  value={form.requiredBehaviors}
                  onChange={(event) => setForm({ ...form, requiredBehaviors: event.target.value })}
                  placeholder="One per line"
                  className="bg-background border-border min-h-24"
                />
              </div>
              <div>
                <Label className="text-xs">Critical Errors</Label>
                <Textarea
                  value={form.criticalErrors}
                  onChange={(event) => setForm({ ...form, criticalErrors: event.target.value })}
                  placeholder="One per line"
                  className="bg-background border-border min-h-24"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (
                  !form.title.trim() ||
                  !form.scenarioFamily.trim() ||
                  !form.targetRole.trim() ||
                  !form.situationSummary.trim() ||
                  !form.openingLine.trim()
                ) {
                  toast.error("Title, family, target role, summary, and opening line are required");
                  return;
                }

                const splitLines = (value: string) =>
                  value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);

                createMutation.mutate({
                  title: form.title.trim(),
                  department: form.department,
                  scenarioFamily: form.scenarioFamily.trim(),
                  targetRole: form.targetRole.trim(),
                  difficulty: form.difficulty,
                  emotionalIntensity: form.emotionalIntensity,
                  complexity: form.complexity,
                  customerPersona: {
                    name: form.customerName.trim() || "Guest",
                    age_band: form.customerAgeBand.trim() || "adult",
                    membership_context: form.membershipContext.trim() || "member",
                    communication_style: form.communicationStyle.trim() || "direct",
                    initial_emotion: form.initialEmotion.trim() || "frustrated",
                    patience_level: form.patienceLevel.trim() || "medium",
                  },
                  situationSummary: form.situationSummary.trim(),
                  openingLine: form.openingLine.trim(),
                  hiddenFacts: splitLines(form.hiddenFacts),
                  approvedResolutionPaths: splitLines(form.approvedResolutionPaths),
                  requiredBehaviors: splitLines(form.requiredBehaviors),
                  criticalErrors: splitLines(form.criticalErrors),
                  recommendedTurns: form.recommendedTurns,
                });
              }}
              disabled={createMutation.isPending}
              className="bg-teal text-slate-deep hover:bg-teal/90"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Scenario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
