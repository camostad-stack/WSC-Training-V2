import { useSimulator } from "@/contexts/SimulatorContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation, Redirect } from "wouter";
import { CheckCircle, XCircle, AlertTriangle, ArrowRight, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { familyLabels } from "@/features/simulator/config";

const passColors: Record<string, { bg: string; text: string; icon: any }> = {
  pass: { bg: "bg-green-500/10", text: "text-green-400", icon: CheckCircle },
  borderline: { bg: "bg-amber-500/10", text: "text-amber-400", icon: AlertTriangle },
  fail: { bg: "bg-red-500/10", text: "text-red-400", icon: XCircle },
};

const readinessLabels: Record<string, string> = {
  not_ready: "Not Ready",
  practice_more: "Practice More",
  shadow_ready: "Shadow Ready",
  partially_independent: "Partially Independent",
  independent: "Independent",
};

const categoryLabels: Record<string, string> = {
  opening_warmth: "Opening Warmth",
  listening_empathy: "Listening & Empathy",
  clarity_directness: "Clarity & Directness",
  policy_accuracy: "Policy Accuracy",
  ownership: "Ownership",
  problem_solving: "Problem Solving",
  de_escalation: "De-Escalation",
  escalation_judgment: "Escalation Judgment",
  visible_professionalism: "Visible Professionalism",
  closing_control: "Closing Control",
};

export default function SessionResults() {
  const [, setLocation] = useLocation();
  const { config, evaluation, coaching, saveStatus, savedSessionId, setConfig } = useSimulator();
  const [showCategories, setShowCategories] = useState(false);

  if (!evaluation) return <Redirect to="/" />;

  const pf = passColors[evaluation.pass_fail] || passColors.borderline;
  const PfIcon = pf.icon;
  const score = evaluation.overall_score || 0;
  const categories = evaluation.category_scores || {};
  const clearAssignmentContext = () => {
    setConfig({
      ...config,
      assignmentId: undefined,
      assignmentTitle: undefined,
      scenarioTemplateId: undefined,
      difficultyMin: undefined,
      difficultyMax: undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-lg mx-auto p-4 space-y-5">
        {/* Score Hero */}
        <div className="text-center pt-6 pb-2">
          <Badge variant="outline" className="mb-3 text-[10px] font-mono border-border">
            Step 3 of 3
          </Badge>
          <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${pf.bg} mb-4`}>
            <span className={`text-4xl font-mono font-bold ${pf.text}`}>{score}</span>
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <PfIcon className={`h-5 w-5 ${pf.text}`} />
            <span className={`font-semibold text-lg ${pf.text} uppercase`}>{evaluation.pass_fail}</span>
          </div>
          <Badge variant="outline" className="text-xs border-border font-mono">
            {readinessLabels[evaluation.readiness_signal] || evaluation.readiness_signal}
          </Badge>
        </div>

        <div className={`panel p-4 ${
          saveStatus === "saved"
            ? "border-green-500/20 bg-green-500/5"
            : saveStatus === "error"
              ? "border-red-500/20 bg-red-500/5"
              : "border-border"
        }`}>
          <div className="text-[10px] font-mono tracking-wider uppercase mb-1">
            {saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save issue" : "Processing"}
          </div>
          <div className="text-sm text-muted-foreground">
            {saveStatus === "saved"
              ? `Results saved to history${savedSessionId ? ` as session #${savedSessionId}` : ""}. Your profile stats now include this session.`
              : saveStatus === "error"
                ? "Results were generated, but the session did not save to history. Practice again after storage is available."
                : "Finalizing your session."}
          </div>
        </div>

        {/* Category Scores */}
        <div className="panel p-4">
          <button
            onClick={() => setShowCategories(!showCategories)}
            className="w-full flex items-center justify-between"
          >
            <span className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Category Scores</span>
            {showCategories ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showCategories && (
            <div className="mt-3 space-y-3">
              {Object.entries(categories).map(([key, val]) => (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{categoryLabels[key] || key}</span>
                    <span className="font-mono text-foreground">{val as number}/10</span>
                  </div>
                  <Progress value={(val as number) * 10} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strengths */}
        {(evaluation.best_moments || []).length > 0 && (
          <div className="panel p-4">
            <div className="text-xs font-mono text-green-400 tracking-wider uppercase mb-2">Strengths</div>
            <ul className="space-y-1.5">
              {(evaluation.best_moments || []).map((s: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Misses */}
        {(evaluation.missed_moments || []).length > 0 && (
          <div className="panel p-4">
            <div className="text-xs font-mono text-amber-400 tracking-wider uppercase mb-2">Misses</div>
            <ul className="space-y-1.5">
              {(evaluation.missed_moments || []).map((s: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Coaching: Replacement Phrases */}
        {coaching?.replacement_phrases && coaching.replacement_phrases.length > 0 && (
          <div className="panel p-4">
            <div className="text-xs font-mono text-teal tracking-wider uppercase mb-2">Better Phrasing</div>
            <div className="space-y-2">
              {coaching.replacement_phrases.map((phrase: string, i: number) => (
                <div key={i} className="bg-teal/5 border border-teal/10 rounded-lg p-3 text-sm text-foreground">
                  {phrase}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaching: Do This Next Time */}
        {coaching?.do_this_next_time && coaching.do_this_next_time.length > 0 && (
          <div className="panel p-4">
            <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Do This Next Time</div>
            <ul className="space-y-1.5">
              {coaching.do_this_next_time.map((item: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-teal mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Summary */}
        {evaluation.summary && (
          <div className="panel p-4">
            <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Summary</div>
            <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.summary}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2">
          <Button
            onClick={() => {
              clearAssignmentContext();
              setLocation("/practice");
            }}
            className="w-full h-12 bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2 rounded-xl"
          >
            <ArrowRight className="h-4 w-4" />
            {coaching?.next_recommended_scenario ? `Next: ${familyLabels[coaching.next_recommended_scenario] || coaching.next_recommended_scenario}` : "Practice Again"}
          </Button>
          <Button
            onClick={() => {
              clearAssignmentContext();
              setLocation("/");
            }}
            variant="outline"
            className="w-full h-12 border-border text-foreground rounded-xl gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
