/*
 * Command Center Design: Results Page — Enhanced 10-Prompt Architecture
 * - Overall score with pass/fail and readiness signal
 * - Category scores as horizontal bar chart
 * - Best moments / missed moments / critical mistakes / coachable mistakes
 * - Employee coaching panel (Prompt 7)
 * - Manager debrief panel (Prompt 8)
 * - Ideal response example
 * - Replacement phrases
 */

import NavHeader from "@/components/NavHeader";
import { Button } from "@/components/ui/button";
import { useSimulator } from "@/contexts/SimulatorContext";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Quote,
  ClipboardCheck,
  ArrowRight,
  RotateCcw,
  Shield,
  Target,
  MessageSquare,
  Users,
  Lightbulb,
  RefreshCw,
} from "lucide-react";

const EVAL_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663357120672/T7ShWeUdbGNTJEK77SyZhN/evaluation-bg-6NR6VvMYnHJmyvoiDnn9ja.webp";

const categoryLabels: Record<string, string> = {
  opening_warmth: "Opening Warmth",
  listening_empathy: "Listening & Empathy",
  clarity_directness: "Clarity & Directness",
  policy_accuracy: "Policy Accuracy",
  ownership: "Ownership",
  problem_solving: "Problem Solving",
  de_escalation: "De-Escalation",
  escalation_judgment: "Escalation Judgment",
  visible_professionalism: "Professionalism",
  closing_control: "Closing Control",
  // Legacy compat
  warmth_opening: "Warmth & Opening",
  clarity_confidence: "Clarity & Confidence",
  active_listening_empathy: "Active Listening",
  ownership_follow_through: "Ownership",
  closing_next_steps: "Closing & Next Steps",
};

const passFailColors: Record<string, { bg: string; text: string; border: string }> = {
  pass: { bg: "bg-success/10", text: "text-success", border: "border-success/30" },
  borderline: { bg: "bg-amber/10", text: "text-amber", border: "border-amber/30" },
  fail: { bg: "bg-danger/10", text: "text-danger", border: "border-danger/30" },
};

const signalColors: Record<string, string> = {
  green: "text-success",
  yellow: "text-amber",
  red: "text-danger",
};

function ScoreBar({ label, score, max = 10 }: { label: string; score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = score >= 7 ? "bg-success" : score >= 5 ? "bg-amber" : "bg-danger";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-36 shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-secondary/50 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className="font-mono text-xs text-foreground w-8 text-right">{score}</span>
    </div>
  );
}

export default function Results() {
  const { evaluation, coaching, scenario } = useSimulator();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"employee" | "manager">("employee");

  if (!evaluation) {
    return (
      <div className="min-h-screen bg-background">
        <NavHeader />
        <div className="pt-14 container py-20 text-center">
          <BarChart3 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="text-muted-foreground">No evaluation data available.</p>
          <Link href="/practice">
            <Button variant="outline" className="mt-4 gap-2">
              Start a Simulation <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const scoreColor =
    evaluation.overall_score >= 80
      ? "text-success"
      : evaluation.overall_score >= 60
      ? "text-amber"
      : "text-danger";

  const scoreBorder =
    evaluation.overall_score >= 80
      ? "border-success/30"
      : evaluation.overall_score >= 60
      ? "border-amber/30"
      : "border-danger/30";

  const scoreGlow =
    evaluation.overall_score >= 80
      ? "shadow-[0_0_30px_oklch(0.72_0.19_145/0.2)]"
      : evaluation.overall_score >= 60
      ? "shadow-[0_0_30px_oklch(0.80_0.16_75/0.2)]"
      : "shadow-[0_0_30px_oklch(0.63_0.24_25/0.2)]";

  const passFail = evaluation.pass_fail || "borderline";
  const readiness = evaluation.readiness_signal || evaluation.competency_estimate || "unknown";
  const pfStyle = passFailColors[passFail] || passFailColors.borderline;

  // Derive fields with fallback for both old and new schema
  const bestMoments = evaluation.best_moments || evaluation.strengths || [];
  const missedMoments = evaluation.missed_moments || evaluation.misses || [];
  const criticalMistakes = evaluation.critical_mistakes || evaluation.policy_or_safety_errors || [];
  const coachableMistakes = evaluation.coachable_mistakes || [];
  const summary = evaluation.summary || evaluation.final_summary || "";
  const idealResponse = evaluation.ideal_response_example || "";
  const mostImportantCorrection = evaluation.most_important_correction || "";

  return (
    <div className="min-h-screen bg-background">
      <NavHeader />

      <div className="pt-14">
        <div className="container py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center justify-between mb-8"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-teal/10 border border-teal/30 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-teal" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Evaluation Results</h1>
                <p className="text-sm text-muted-foreground">
                  {scenario?.scenario_id} — {scenario?.customer_persona?.name}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/practice">
                <Button variant="outline" size="sm" className="gap-1.5 font-mono text-xs">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Start Practice
                </Button>
              </Link>
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Score + Categories */}
            <div className="lg:col-span-2 space-y-6">
              {/* Overall Score with Pass/Fail and Readiness */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="panel p-6 relative overflow-hidden"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-10"
                  style={{ backgroundImage: `url(${EVAL_BG})` }}
                />
                <div className="relative flex items-center gap-8">
                  {/* Score Circle */}
                  <div className={`w-32 h-32 rounded-full border-4 ${scoreBorder} ${scoreGlow} flex items-center justify-center bg-background/50 shrink-0`}>
                    <div className="text-center">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className={`font-mono text-4xl font-bold ${scoreColor}`}
                      >
                        {evaluation.overall_score}
                      </motion.div>
                      <div className="text-xs text-muted-foreground font-mono">/100</div>
                    </div>
                  </div>

                  {/* Score Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      {/* Pass/Fail Badge */}
                      <span className={`font-mono text-xs px-3 py-1 rounded border ${pfStyle.bg} ${pfStyle.text} ${pfStyle.border} uppercase tracking-wider font-bold`}>
                        {passFail}
                      </span>
                      {/* Readiness Signal */}
                      <span className="font-mono text-xs px-3 py-1 rounded border border-border bg-secondary/30 text-muted-foreground uppercase tracking-wider">
                        {readiness.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {summary}
                    </p>
                  </div>
                </div>
              </motion.div>

              {/* Category Scores */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
                className="panel p-6"
              >
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-4 h-4 text-teal" />
                  <span className="font-mono text-xs text-teal tracking-wider uppercase">
                    Category Breakdown
                  </span>
                </div>
                <div className="space-y-3">
                  {Object.entries(evaluation.category_scores).map(([key, score]) => (
                    <ScoreBar
                      key={key}
                      label={categoryLabels[key] || key.replace(/_/g, " ")}
                      score={score}
                    />
                  ))}
                </div>
              </motion.div>

              {/* Best Moments & Missed Moments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                  className="panel p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span className="font-mono text-xs text-success tracking-wider uppercase">Best Moments</span>
                  </div>
                  <div className="space-y-2">
                    {bestMoments.map((s: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.25 }}
                  className="panel p-5"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <XCircle className="w-4 h-4 text-danger" />
                    <span className="font-mono text-xs text-danger tracking-wider uppercase">Missed Moments</span>
                  </div>
                  <div className="space-y-2">
                    {missedMoments.map((m: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <XCircle className="w-3.5 h-3.5 text-danger shrink-0 mt-0.5" />
                        <span>{m}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* Critical Mistakes */}
              {criticalMistakes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.35 }}
                  className="panel p-5 border-danger/20"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-danger" />
                    <span className="font-mono text-xs text-danger tracking-wider uppercase">
                      Critical Mistakes
                    </span>
                  </div>
                  <div className="space-y-2">
                    {criticalMistakes.map((e: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-danger/80">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{e}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Coachable Mistakes */}
              {coachableMistakes.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.38 }}
                  className="panel p-5 border-amber/20"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <Lightbulb className="w-4 h-4 text-amber" />
                    <span className="font-mono text-xs text-amber tracking-wider uppercase">
                      Coachable Mistakes
                    </span>
                  </div>
                  <div className="space-y-2">
                    {coachableMistakes.map((e: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Lightbulb className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                        <span>{e}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Most Important Correction + Ideal Response */}
              {(mostImportantCorrection || idealResponse) && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 }}
                  className="panel p-5"
                >
                  {mostImportantCorrection && (
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Target className="w-4 h-4 text-amber" />
                        <span className="font-mono text-xs text-amber tracking-wider uppercase">
                          Most Important Correction
                        </span>
                      </div>
                      <div className="bg-amber/5 border border-amber/20 rounded-md p-3">
                        <p className="text-sm text-muted-foreground">{mostImportantCorrection}</p>
                      </div>
                    </div>
                  )}
                  {idealResponse && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Quote className="w-4 h-4 text-teal" />
                        <span className="font-mono text-xs text-teal tracking-wider uppercase">
                          Ideal Response Example
                        </span>
                      </div>
                      <div className="bg-teal/5 border border-teal/20 rounded-md p-3 border-l-2 border-l-teal/40">
                        <p className="text-sm text-muted-foreground italic">{idealResponse}</p>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Right Column: Coaching Tabs */}
            <div className="space-y-6">
              {coaching && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="panel p-5 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto"
                >
                  {/* Tab Switcher */}
                  <div className="flex gap-1 mb-5 bg-secondary/30 rounded-md p-1">
                    <button
                      onClick={() => setActiveTab("employee")}
                      className={`flex-1 flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-wider uppercase py-1.5 rounded transition-colors ${
                        activeTab === "employee"
                          ? "bg-teal/10 text-teal border border-teal/20"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <MessageSquare className="w-3 h-3" />
                      My Coaching
                    </button>
                    <button
                      onClick={() => setActiveTab("manager")}
                      className={`flex-1 flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-wider uppercase py-1.5 rounded transition-colors ${
                        activeTab === "manager"
                          ? "bg-amber/10 text-amber border border-amber/20"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Users className="w-3 h-3" />
                      Manager View
                    </button>
                  </div>

                  {/* Employee Coaching Tab (Prompt 7) */}
                  {activeTab === "employee" && (
                    <div className="space-y-5">
                      {/* Summary */}
                      <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {coaching.employee_coaching_summary || coaching.manager_summary || ""}
                        </p>
                      </div>

                      {/* What You Did Well */}
                      {(coaching.what_you_did_well || coaching.top_3_strengths || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-success tracking-wider uppercase">
                            What You Did Well
                          </span>
                          <div className="mt-2 space-y-2">
                            {(coaching.what_you_did_well || coaching.top_3_strengths || []).map((s: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3 text-success shrink-0 mt-0.5" />
                                <span>{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* What Hurt You */}
                      {(coaching.what_hurt_you || coaching.top_3_corrections || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-danger tracking-wider uppercase">
                            What Hurt You
                          </span>
                          <div className="mt-2 space-y-2">
                            {(coaching.what_hurt_you || coaching.top_3_corrections || []).map((c: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <XCircle className="w-3 h-3 text-danger shrink-0 mt-0.5" />
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Do This Next Time */}
                      {(coaching.do_this_next_time || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-teal tracking-wider uppercase">
                            Do This Next Time
                          </span>
                          <div className="mt-2 space-y-2">
                            {coaching.do_this_next_time.map((d: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <ArrowRight className="w-3 h-3 text-teal shrink-0 mt-0.5" />
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Replacement Phrases */}
                      {(coaching.replacement_phrases || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-amber tracking-wider uppercase">
                            Better Phrases to Use
                          </span>
                          <div className="mt-2 space-y-2">
                            {coaching.replacement_phrases.map((p: string, i: number) => (
                              <div key={i} className="bg-amber/5 border border-amber/15 rounded-md p-2 text-xs text-muted-foreground">
                                <RefreshCw className="w-3 h-3 text-amber inline mr-1.5" />
                                {p}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Practice Focus */}
                      {coaching.practice_focus && (
                        <div className="bg-teal/5 border border-teal/20 rounded-md p-3">
                          <span className="font-mono text-[10px] text-teal tracking-wider uppercase">
                            Practice Focus
                          </span>
                          <p className="text-sm mt-1">{coaching.practice_focus}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manager Debrief Tab (Prompt 8) */}
                  {activeTab === "manager" && (
                    <div className="space-y-5">
                      <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {coaching.manager_summary || coaching.employee_coaching_summary || "Manager debrief data not available for this session."}
                        </p>
                      </div>

                      {/* Performance Signal */}
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">Signal:</span>
                        <span className={`font-mono text-xs font-bold uppercase ${
                          passFail === "pass" ? "text-success" : passFail === "fail" ? "text-danger" : "text-amber"
                        }`}>
                          {passFail === "pass" ? "GREEN" : passFail === "fail" ? "RED" : "YELLOW"}
                        </span>
                      </div>

                      {/* Manager Strengths */}
                      {(coaching.top_3_strengths || coaching.what_you_did_well || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-success tracking-wider uppercase">
                            Top Strengths
                          </span>
                          <div className="mt-2 space-y-2">
                            {(coaching.top_3_strengths || coaching.what_you_did_well || []).map((s: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="text-success font-mono font-bold">{i + 1}.</span>
                                <span>{s}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Manager Corrections */}
                      {(coaching.top_3_corrections || coaching.what_hurt_you || []).length > 0 && (
                        <div>
                          <span className="font-mono text-[10px] text-amber tracking-wider uppercase">
                            Top Corrections
                          </span>
                          <div className="mt-2 space-y-2">
                            {(coaching.top_3_corrections || coaching.what_hurt_you || []).map((c: string, i: number) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                                <span className="text-amber font-mono font-bold">{i + 1}.</span>
                                <span>{c}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Follow-up Flags */}
                      {coaching.manager_follow_up_needed && (
                        <div className="bg-danger/5 border border-danger/20 rounded-md p-3 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-danger" />
                          <span className="text-xs text-danger font-mono tracking-wider uppercase">
                            Manager Follow-Up Required
                          </span>
                        </div>
                      )}

                      {/* Next Drill */}
                      <div className="bg-teal/5 border border-teal/20 rounded-md p-3">
                        <span className="font-mono text-[10px] text-teal tracking-wider uppercase">
                          Recommended Next Drill
                        </span>
                        <p className="text-sm mt-1">
                          {coaching.next_drill || coaching.next_recommended_scenario || coaching.practice_focus || "Continue with next difficulty level"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Start Next Scenario */}
                  <div className="mt-5 pt-5 border-t border-border/50">
                    <Link href="/practice">
                      <Button
                        className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2"
                        size="sm"
                      >
                        Start Practice
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
