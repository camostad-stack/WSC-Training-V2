/*
 * Command Center Design: Simulate Page — Enhanced 10-Prompt Architecture
 * - Split-pane: left conversation, right scenario intel panel with live state
 * - Chat bubbles with emotion + trust indicators
 * - Real AI customer simulation with state tracking via tRPC
 * - Status bar showing turn count, emotion, trust level, risk level
 */

import NavHeader from "@/components/NavHeader";
import { Button } from "@/components/ui/button";
import { useSimulator } from "@/contexts/SimulatorContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  AlertTriangle,
  User,
  Bot,
  Phone,
  Users,
  ChevronRight,
  Eye,
  EyeOff,
  BarChart3,
  Loader2,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
} from "lucide-react";

const emotionColors: Record<string, string> = {
  calm: "bg-success/20 text-success border-success/30",
  steady: "bg-success/20 text-success border-success/30",
  reassured: "bg-success/20 text-success border-success/30",
  concerned: "bg-amber/20 text-amber border-amber/30",
  unsettled: "bg-amber/20 text-amber border-amber/30",
  guarded: "bg-amber/20 text-amber border-amber/30",
  stressed: "bg-amber/20 text-amber border-amber/30",
  protective: "bg-amber/20 text-amber border-amber/30",
  frustrated: "bg-amber/20 text-amber border-amber/30",
  angry: "bg-danger/20 text-danger border-danger/30",
  upset: "bg-danger/20 text-danger border-danger/30",
  alarmed: "bg-danger/20 text-danger border-danger/30",
  confused: "bg-teal/20 text-teal border-teal/30",
  skeptical: "bg-amber/20 text-amber border-amber/30",
  relieved: "bg-success/20 text-success border-success/30",
};

const riskColors: Record<string, string> = {
  low: "text-success",
  moderate: "text-amber",
  high: "text-danger",
};

interface ConversationState {
  turn_number: number;
  emotion_state: string;
  trust_level: number;
  issue_clarity: number;
  employee_flags: {
    showed_empathy: boolean;
    answered_directly: boolean;
    used_correct_policy: boolean;
    took_ownership: boolean;
    avoided_question: boolean;
    critical_error: boolean;
  };
  escalation_required: boolean;
  scenario_risk_level: string;
  continue_simulation: boolean;
}

export default function Simulate() {
  const {
    scenario,
    conversation,
    addTurn,
    setEvaluation,
    setCoaching,
    isSimulating,
    setIsSimulating,
  } = useSimulator();
  const [, navigate] = useLocation();
  const [input, setInput] = useState("");
  const [currentEmotion, setCurrentEmotion] = useState("angry");
  const [turnCount, setTurnCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [showHiddenFacts, setShowHiddenFacts] = useState(false);
  const [scenarioComplete, setScenarioComplete] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Enhanced state tracking
  const [convState, setConvState] = useState<ConversationState | null>(null);
  const [stateHistory, setStateHistory] = useState<ConversationState[]>([]);
  const [revealedFacts, setRevealedFacts] = useState<string[]>([]);
  const [managerNeeded, setManagerNeeded] = useState(false);

  const customerReplyMutation = trpc.simulator.customerReply.useMutation();
  const evaluateMutation = trpc.simulator.evaluate.useMutation();
  const saveSessionMutation = trpc.simulator.saveSession.useMutation();

  useEffect(() => {
    if (!scenario) {
      navigate("/practice");
      return;
    }
    if (conversation.length === 0) {
      const initialEmotion = (scenario as any).customer_persona?.initial_emotion ||
        (scenario as any).emotion_progression?.starting_state || "frustrated";
      setCurrentEmotion(initialEmotion);
      addTurn({
        role: "customer",
        message: scenario.opening_line,
        emotion: initialEmotion,
        timestamp: Date.now(),
      });
      setIsSimulating(true);
    }
  }, [scenario]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping || scenarioComplete || !scenario) return;

    const employeeMessage = input.trim();
    setInput("");

    addTurn({
      role: "employee",
      message: employeeMessage,
      timestamp: Date.now(),
    });

    const newTurnCount = turnCount + 1;
    setTurnCount(newTurnCount);
    setIsTyping(true);

    try {
      const currentTranscript = [
        ...conversation.map(t => ({
          role: t.role as "customer" | "employee",
          message: t.message,
          emotion: t.emotion,
        })),
        { role: "employee" as const, message: employeeMessage, emotion: undefined },
      ];

      // Call combined Prompt 2 (Customer) + Prompt 3 (State Manager)
      const result = await customerReplyMutation.mutateAsync({
        scenarioJson: scenario,
        stateJson: convState,
        transcript: currentTranscript,
        employeeResponse: employeeMessage,
      });

      const { customerReply, stateUpdate } = result;

      // Update emotion and state
      setCurrentEmotion(customerReply.updated_emotion);
      setConvState(stateUpdate);
      setStateHistory(prev => [...prev, stateUpdate]);

      // Track revealed hidden facts
      if (customerReply.new_hidden_fact_revealed && customerReply.new_hidden_fact_revealed.trim() !== "") {
        setRevealedFacts(prev => [...prev, customerReply.new_hidden_fact_revealed]);
      }

      // Track manager escalation
      if (customerReply.manager_needed) {
        setManagerNeeded(true);
      }

      addTurn({
        role: "customer",
        message: customerReply.customer_reply,
        emotion: customerReply.updated_emotion,
        timestamp: Date.now(),
      });

      setIsTyping(false);

      // Check if scenario should end
      if (
        customerReply.scenario_complete ||
        !stateUpdate.continue_simulation ||
        newTurnCount >= (scenario.recommended_turns || 4)
      ) {
        setScenarioComplete(true);
        setIsSimulating(false);
        toast.info("Scenario complete. View your evaluation results.");
      }
    } catch (err) {
      setIsTyping(false);
      toast.error("AI response failed. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleViewResults = async () => {
    if (!scenario) return;
    setIsEvaluating(true);

    try {
      const transcript = conversation.map(t => ({
        role: t.role as "customer" | "employee",
        message: t.message,
        emotion: t.emotion,
      }));

      // Run full post-session evaluation chain (policy grounding + quality gate + evaluation + coaching + manager debrief)
      const evalBundle = await evaluateMutation.mutateAsync({
        scenarioJson: scenario,
        transcript,
        stateHistory,
        employeeRole: scenario.employee_role,
      });

      const evalResult = (evalBundle as any).evaluation;
      const policyGrounding = (evalBundle as any).policyGrounding;
      const coaching = (evalBundle as any).coaching;
      const managerDebrief = (evalBundle as any).managerDebrief;
      const sessionQuality = (evalBundle as any).sessionQuality;
      const visibleBehavior = (evalBundle as any).visibleBehavior;
      const processingStatus = ((evalBundle as any).processingStatus || "completed") as "completed" | "invalid" | "reprocess";
      const processingFailure = (evalBundle as any).failure as { message?: string } | undefined;
      setEvaluation(evalResult);
      setCoaching(coaching);

      if (processingStatus !== "completed") {
        toast.warning(processingFailure?.message || sessionQuality?.reason || "Session flagged for reprocessing.");
      }

      // Save session with all enhanced data
      saveSessionMutation.mutate({
        scenarioId: scenario.scenario_id,
        employeeRole: scenario.employee_role,
        difficulty: scenario.difficulty,
        mode: (scenario as any).mode || "in_person",
        scenarioFamily: (scenario as any).scenario_family,
        scenarioJson: scenario,
        transcript,
        stateHistory,
        policyGrounding,
        visibleBehavior,
        evaluationResult: evalResult,
        coachingResult: coaching,
        managerDebrief,
        sessionQuality: sessionQuality?.session_quality,
        lowEffortResult: sessionQuality,
        overallScore: processingStatus === "completed" ? evalResult?.overall_score : undefined,
        passFail: processingStatus === "completed" ? evalResult?.pass_fail : undefined,
        readinessSignal: processingStatus === "completed" ? evalResult?.readiness_signal : undefined,
        categoryScores: processingStatus === "completed" ? evalResult?.category_scores : undefined,
        status: processingStatus,
        flagReason: processingFailure?.message || sessionQuality?.reason,
      });

      navigate("/practice/results");
    } catch (err) {
      toast.error("Evaluation failed. Please try again.");
    } finally {
      setIsEvaluating(false);
    }
  };

  if (!scenario) return null;

  // Derive scenario fields (handle both old and new schema)
  const customerName = scenario.customer_persona?.name || "Customer";
  const membershipInfo = (scenario.customer_persona as any)?.membership_context ||
    (scenario.customer_persona as any)?.membership_status || "";
  const issueType = (scenario as any).scenario_family || (scenario as any).issue_type || "";
  const successCriteria = (scenario as any).required_behaviors || (scenario as any).success_criteria || [];
  const failureTriggers = (scenario as any).critical_errors || (scenario as any).failure_triggers || [];
  const hiddenFacts = scenario.hidden_facts || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <NavHeader />

      <div className="pt-14 flex-1 flex flex-col">
        {/* Enhanced Status Bar */}
        <div className="border-b border-border/50 bg-card/50">
          <div className="container flex items-center justify-between py-2">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {(scenario as any).mode === "phone" ? (
                  <Phone className="w-3.5 h-3.5 text-amber" />
                ) : (
                  <Users className="w-3.5 h-3.5 text-teal" />
                )}
                <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">
                  {(scenario as any).mode || "in-person"}
                </span>
              </div>
              <div className="h-4 w-px bg-border" />
              <span className="font-mono text-xs text-muted-foreground">
                Turn <span className="text-teal font-bold">{turnCount}</span>/{scenario.recommended_turns}
              </span>
              <div className="h-4 w-px bg-border" />
              <span className={`font-mono text-xs px-2 py-0.5 rounded border ${emotionColors[currentEmotion] || "bg-secondary text-muted-foreground border-border"}`}>
                {currentEmotion}
              </span>
              {convState && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                    Trust: <span className="text-teal font-bold">{convState.trust_level}</span>/10
                  </span>
                  <div className="h-4 w-px bg-border" />
                  <span className={`font-mono text-xs flex items-center gap-1 ${riskColors[convState.scenario_risk_level] || "text-muted-foreground"}`}>
                    <Activity className="w-3 h-3" />
                    {convState.scenario_risk_level}
                  </span>
                </>
              )}
              {managerNeeded && (
                <>
                  <div className="h-4 w-px bg-border" />
                  <span className="font-mono text-xs text-danger flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    ESCALATE
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isSimulating && !scenarioComplete && (
                <span className="flex items-center gap-1.5 font-mono text-xs text-teal">
                  <span className="status-dot bg-teal" />
                  LIVE
                </span>
              )}
              {scenarioComplete && (
                <Button
                  size="sm"
                  onClick={handleViewResults}
                  disabled={isEvaluating}
                  className="bg-teal text-slate-deep hover:bg-teal/90 font-mono text-xs gap-1.5"
                >
                  {isEvaluating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Evaluating...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="w-3.5 h-3.5" />
                      View Results
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 container py-4 flex gap-4">
          {/* Left: Chat Area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 pb-4 pr-2">
              <AnimatePresence>
                {conversation.map((turn, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`flex gap-3 ${turn.role === "employee" ? "flex-row-reverse" : ""}`}
                  >
                    <div
                      className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                        turn.role === "customer"
                          ? "bg-amber/10 border border-amber/30"
                          : "bg-teal/10 border border-teal/30"
                      }`}
                    >
                      {turn.role === "customer" ? (
                        <Bot className="w-4 h-4 text-amber" />
                      ) : (
                        <User className="w-4 h-4 text-teal" />
                      )}
                    </div>

                    <div
                      className={`max-w-[75%] rounded-lg p-3 ${
                        turn.role === "customer"
                          ? "bg-secondary/50 border border-border/50"
                          : "bg-teal/10 border border-teal/20"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">
                          {turn.role === "customer" ? customerName : "You"}
                        </span>
                        {turn.emotion && (
                          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${emotionColors[turn.emotion] || ""}`}>
                            {turn.emotion}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed">{turn.message}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Typing Indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-md bg-amber/10 border border-amber/30 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-amber" />
                  </div>
                  <div className="bg-secondary/50 border border-border/50 rounded-lg p-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-border/50 pt-4">
              {scenarioComplete ? (
                <div className="panel p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">Scenario complete. Review your performance evaluation.</p>
                  <Button
                    onClick={handleViewResults}
                    disabled={isEvaluating}
                    className="bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2"
                  >
                    {isEvaluating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        AI Evaluating...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="w-4 h-4" />
                        View Evaluation Results
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your response as the employee..."
                    className="flex-1 bg-secondary/30 border border-border rounded-md px-4 py-3 text-sm resize-none focus:outline-none focus:border-teal/50 focus:ring-1 focus:ring-teal/20 placeholder:text-muted-foreground/50"
                    rows={2}
                    disabled={isTyping}
                  />
                  <Button
                    onClick={handleSend}
                    disabled={!input.trim() || isTyping}
                    className="bg-teal text-slate-deep hover:bg-teal/90 self-end px-4"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Enhanced Intel Panel */}
          <div className="hidden lg:block w-80 shrink-0">
            <div className="panel p-4 space-y-4 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-teal" />
                  <span className="font-mono text-xs text-teal tracking-wider uppercase">Intel</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{scenario.scenario_id}</span>
              </div>

              {/* Customer Info */}
              <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                <span className="font-mono text-[10px] text-muted-foreground tracking-wider uppercase">Customer</span>
                <p className="text-sm font-semibold mt-1">{customerName}</p>
                <p className="text-xs text-muted-foreground">{membershipInfo}</p>
              </div>

              {/* Live State Meters */}
              {convState && (
                <div className="bg-secondary/30 rounded-md p-3 border border-border/50 space-y-2">
                  <span className="font-mono text-[10px] text-teal tracking-wider uppercase">Live State</span>

                  {/* Trust Level */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Trust</span>
                    <div className="flex items-center gap-1">
                      <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal rounded-full transition-all duration-500"
                          style={{ width: `${(convState.trust_level / 10) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-teal w-6 text-right">{convState.trust_level}</span>
                    </div>
                  </div>

                  {/* Issue Clarity */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Clarity</span>
                    <div className="flex items-center gap-1">
                      <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber rounded-full transition-all duration-500"
                          style={{ width: `${(convState.issue_clarity / 10) * 100}%` }}
                        />
                      </div>
                      <span className="font-mono text-amber w-6 text-right">{convState.issue_clarity}</span>
                    </div>
                  </div>

                  {/* Employee Flags */}
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {Object.entries(convState.employee_flags).map(([key, val]) => (
                      <div
                        key={key}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          key === "avoided_question" || key === "critical_error"
                            ? val ? "border-danger/30 text-danger bg-danger/10" : "border-border/30 text-muted-foreground/50"
                            : val ? "border-success/30 text-success bg-success/10" : "border-border/30 text-muted-foreground/50"
                        }`}
                      >
                        {key.replace(/_/g, " ")}
                      </div>
                    ))}
                  </div>

                  {convState.escalation_required && (
                    <div className="flex items-center gap-1.5 text-xs text-danger mt-1 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      Escalation Required
                    </div>
                  )}
                </div>
              )}

              {/* Issue */}
              <div className="bg-secondary/30 rounded-md p-3 border border-border/50">
                <span className="font-mono text-[10px] text-amber tracking-wider uppercase">Issue</span>
                <p className="text-xs mt-1">{issueType}</p>
              </div>

              {/* Required Behaviors / Success Criteria */}
              <div>
                <span className="font-mono text-[10px] text-teal tracking-wider uppercase">Required Behaviors</span>
                <div className="mt-2 space-y-1.5">
                  {successCriteria.slice(0, 4).map((c: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="w-3 h-3 text-teal shrink-0 mt-0.5" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Critical Errors / Failure Triggers */}
              <div>
                <span className="font-mono text-[10px] text-danger tracking-wider uppercase">Critical Errors</span>
                <div className="mt-2 space-y-1.5">
                  {failureTriggers.slice(0, 3).map((f: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="w-3 h-3 text-danger shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revealed Facts */}
              {revealedFacts.length > 0 && (
                <div>
                  <span className="font-mono text-[10px] text-success tracking-wider uppercase">Revealed Facts</span>
                  <div className="mt-2 space-y-1.5">
                    {revealedFacts.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-success/80">
                        <Shield className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hidden Facts Toggle */}
              <div>
                <button
                  onClick={() => setShowHiddenFacts(!showHiddenFacts)}
                  className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground tracking-wider uppercase hover:text-foreground transition-colors"
                >
                  {showHiddenFacts ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  Hidden Facts {showHiddenFacts ? "(Hide)" : "(Reveal)"}
                </button>
                <AnimatePresence>
                  {showHiddenFacts && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-2 space-y-1.5 overflow-hidden"
                    >
                      {hiddenFacts.map((f: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber/70">
                          <Eye className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
