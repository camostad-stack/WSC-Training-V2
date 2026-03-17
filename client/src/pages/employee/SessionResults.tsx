import { useSimulator } from "@/contexts/SimulatorContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLocation, Redirect } from "wouter";
import { CheckCircle, XCircle, AlertTriangle, ArrowRight, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { familyLabels } from "@/features/simulator/config";
import { buildPostCallDebrief } from "@/features/simulator/debrief";

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

const scoreDimensionLabels: Record<string, string> = {
  interaction_quality: "Interaction Quality",
  operational_effectiveness: "Operational Effectiveness",
  outcome_quality: "Outcome Quality",
};

const scoreDimensionDescriptions: Record<string, { description: string; weight: string }> = {
  interaction_quality: {
    description: "How well you communicated, listened, and handled the customer moment to moment.",
    weight: "20",
  },
  operational_effectiveness: {
    description: "How clearly you explained the issue, set expectations, and moved the situation forward.",
    weight: "25",
  },
  outcome_quality: {
    description: "Whether the issue actually landed in a clean result, valid redirect, or usable next step.",
    weight: "55",
  },
};

export default function SessionResults() {
  const [, setLocation] = useLocation();
  const { config, evaluation, coaching, managerDebrief, saveStatus, savedSessionId, setConfig, stateHistory } = useSimulator();
  const [showCategories, setShowCategories] = useState(false);

  if (!evaluation) return <Redirect to="/" />;

  const pf = passColors[evaluation.pass_fail] || passColors.borderline;
  const PfIcon = pf.icon;
  const score = evaluation.overall_score || 0;
  const categories = evaluation.category_scores || {};
  const scoreDimensions = evaluation.score_dimensions || null;
  const scoreRubric = evaluation.score_rubric || {
    name: "Outcome Weighted",
    dimension_weights: {
      interaction_quality: 20,
      operational_effectiveness: 25,
      outcome_quality: 55,
    },
  };
  const debrief = buildPostCallDebrief({
    stateHistory,
    evaluation,
    coaching,
    managerDebrief,
  });
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

        {scoreDimensions && (
          <div className="panel p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Score Dimensions</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Your final score is split into three parts so a warm conversation without a real outcome does not
                  score too well.
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono border-border shrink-0">
                {scoreRubric.name}
              </Badge>
            </div>
            <div className="space-y-3">
              {Object.entries(scoreDimensions).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border bg-background/40 p-3">
                  {(() => {
                    const rubricWeight = scoreRubric.dimension_weights?.[key as keyof typeof scoreRubric.dimension_weights];
                    return (
                      <>
                  <div className="flex justify-between items-start gap-3 text-xs mb-2">
                    <div>
                      <div className="text-foreground font-medium">{scoreDimensionLabels[key] || key}</div>
                      <div className="mt-1 text-muted-foreground leading-relaxed">
                        {scoreDimensionDescriptions[key]?.description || "Scored from the evidence in your session."}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-foreground">{value}/100</div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        Weight {rubricWeight ?? scoreDimensionDescriptions[key]?.weight ?? "--"}%
                      </div>
                    </div>
                  </div>
                  <div className="mb-2">
                    <Progress value={value} className="h-2" />
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {key === "outcome_quality"
                      ? "This score stays low if there was no real resolution, accepted next step, or valid handoff."
                      : key === "operational_effectiveness"
                        ? "This score reflects whether you moved the issue forward in a practical, usable way."
                        : "This score reflects the quality of your customer handling and communication."}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-border bg-background/40 p-3">
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                Why This Matters
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Outcome quality is weighted most heavily, so a warm conversation without a real resolution or valid
                redirect will still score lower overall.
              </p>
            </div>
          </div>
        )}

        <div className="panel p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Outcome Review</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                This is the after-call read on whether the issue actually landed, not just whether the conversation felt calm.
              </p>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] font-mono border-0 ${
                debrief.isActuallyResolved || debrief.escalationWasValid
                  ? "bg-green-500/10 text-green-400"
                  : debrief.outcomeState === "PARTIALLY_RESOLVED"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
              }`}
            >
              {debrief.outcomeState.replace(/_/g, " ")}
            </Badge>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-background/40 p-3">
              <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                Why This Did Or Did Not Count As Complete
              </div>
              <p className="text-muted-foreground leading-relaxed">{debrief.whyThisDidOrDidNotCountAsComplete}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                  What The Customer Still Needed
                </div>
                {debrief.customerStillNeeded.length === 0 ? (
                  <p className="text-muted-foreground">Nothing material was left open at the end.</p>
                ) : (
                  <ul className="space-y-1.5 text-muted-foreground">
                    {debrief.customerStillNeeded.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-3">
                <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                  Recommended Replay Focus
                </div>
                {debrief.recommendedReplayFocus.length === 0 ? (
                  <p className="text-muted-foreground">Replay the moments where the customer’s tone changed and confirm the same outcome still lands.</p>
                ) : (
                  <ul className="space-y-1.5 text-muted-foreground">
                    {debrief.recommendedReplayFocus.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <ArrowRight className="h-3.5 w-3.5 text-teal mt-0.5 shrink-0" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="panel p-4">
            <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Where Trust Moved</div>
            <ul className="space-y-1.5">
              {debrief.whereTrustMoved.map((item) => (
                <li key={item} className="text-sm text-muted-foreground flex items-start gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-teal mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">What Changed The Customer’s Tone</div>
            <ul className="space-y-1.5">
              {(debrief.whatChangedCustomerTone.length > 0 ? debrief.whatChangedCustomerTone : debrief.emotionalProgression).map((item) => (
                <li key={item} className="text-sm text-muted-foreground flex items-start gap-2">
                  <ArrowRight className="h-3.5 w-3.5 text-teal mt-0.5 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {debrief.prematureClosureAttempts.length > 0 && (
          <div className="panel p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-xs font-mono text-red-400 tracking-wider uppercase">Premature Closure Attempts</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  These are the moments where you tried to land the conversation before the issue was actually ready to close.
                </p>
              </div>
              <Badge variant="outline" className="border-0 bg-red-500/10 text-red-400 text-[10px] font-mono shrink-0">
                Blocked By Design
              </Badge>
            </div>
            <div className="space-y-3">
              {debrief.prematureClosureAttempts.map((attempt) => (
                <div key={`${attempt.turn}-${attempt.trigger}`} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Turn {attempt.turn}
                  </div>
                  <p className="mt-1 text-sm text-foreground">Trigger: {attempt.trigger}</p>
                  <div className="mt-2 text-sm text-muted-foreground">Customer reaction: {attempt.customerReaction}</div>
                  <div className="mt-2 text-sm text-muted-foreground">Recovery: {attempt.recovery}</div>
                  {attempt.unresolvedGaps.length > 0 && (
                    <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                      {attempt.unresolvedGaps.slice(0, 3).map((gap) => (
                        <li key={gap} className="flex items-start gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(debrief.missedMoments.length > 0 || debrief.prematureClosureAttempted) && (
          <div className="panel p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <div className="text-xs font-mono text-amber-400 tracking-wider uppercase">Missed Moments Tied To Actual Turns</div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  These are the moments that blocked completion or cost you credibility.
                </p>
              </div>
              {debrief.prematureClosureAttempted && (
                <Badge variant="outline" className="border-0 bg-red-500/10 text-red-400 text-[10px] font-mono shrink-0">
                  Premature Closure Seen
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              {debrief.missedMoments.map((moment) => (
                <div key={`${moment.turn}-${moment.title}`} className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    Turn {moment.turn} · {moment.title}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{moment.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {(debrief.strongestPositiveBehaviors.length > 0 || debrief.bestRecoveryMoment || debrief.polishedButUnresolved) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <div className="text-xs font-mono text-green-400 tracking-wider uppercase mb-2">Strongest Positive Behaviors</div>
              {debrief.strongestPositiveBehaviors.length === 0 ? (
                <p className="text-sm text-muted-foreground">No clear positive patterns were captured beyond the scorecard.</p>
              ) : (
                <ul className="space-y-1.5">
                  {debrief.strongestPositiveBehaviors.map((item) => (
                    <li key={item} className="text-sm text-muted-foreground flex items-start gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {debrief.bestRecoveryMoment && (
                <div className="mt-3 rounded-xl border border-border bg-background/40 p-3">
                  <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
                    Best Recovery Moment
                  </div>
                  <p className="text-sm text-muted-foreground">{debrief.bestRecoveryMoment}</p>
                </div>
              )}
            </div>

            <div className="panel p-4">
              <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2">Interaction Vs Outcome</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{debrief.interactionVsOutcomeNote}</p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <div>Valid next step: <span className="text-foreground font-mono">{debrief.hasValidNextStep ? "yes" : "no"}</span></div>
                <div>Escalation valid: <span className="text-foreground font-mono">{debrief.escalationWasValid ? "yes" : "no"}</span></div>
                <div>Issue actually resolved: <span className="text-foreground font-mono">{debrief.isActuallyResolved ? "yes" : "no"}</span></div>
                {debrief.polishedButUnresolved && (
                  <div className="rounded-xl border border-border bg-amber-500/5 p-3 text-amber-300">
                    You sounded composed, but the conversation still ended without a clean outcome.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
