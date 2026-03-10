import { useSimulator, type ConversationTurn } from "@/contexts/SimulatorContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, Redirect } from "wouter";
import { useState, useRef, useEffect } from "react";
import { Loader2, Send, X, User, Headphones } from "lucide-react";
import { toast } from "sonner";

export default function PracticeSession() {
  const [, setLocation] = useLocation();
  const {
    scenario, config, conversation, addStateSnapshot, addTurn, stateHistory,
    setEvaluation, setCoaching, setManagerDebrief, setSaveStatus, setSavedSessionId,
  } = useSimulator();
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [turnCount, setTurnCount] = useState(() => stateHistory[stateHistory.length - 1]?.turn_number ?? 0);
  const [currentEmotion, setCurrentEmotion] = useState(
    () => stateHistory[stateHistory.length - 1]?.emotion_state || scenario?.customer_persona?.initial_emotion || "frustrated"
  );
  const [isComplete, setIsComplete] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationStep, setEvaluationStep] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const simulateMutation = trpc.simulator.customerReply.useMutation();
  const evaluateMutation = trpc.simulator.evaluate.useMutation();
  const saveSessionMutation = trpc.simulator.saveSession.useMutation();
  const utils = trpc.useUtils();

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [conversation]);

  // Add opening line on mount
  useEffect(() => {
    if (scenario && conversation.length === 0) {
      addTurn({
        role: "customer",
        message: scenario.opening_line,
        emotion: scenario.customer_persona?.initial_emotion || "frustrated",
        timestamp: Date.now(),
      });
    }
  }, []);

  if (!scenario) return <Redirect to="/practice" />;
  const targetTurns = Math.max(3, Math.min(5, scenario.recommended_turns || 4));

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const msg = input.trim();
    setInput("");

    const employeeTurn: ConversationTurn = {
      role: "employee",
      message: msg,
      timestamp: Date.now(),
    };
    addTurn(employeeTurn);
    setIsProcessing(true);

    try {
      const transcriptArr = [...conversation, employeeTurn].map(t => ({
        role: t.role as "employee" | "customer",
        message: t.message,
        emotion: t.emotion,
      }));

      const result = await simulateMutation.mutateAsync({
        scenarioJson: scenario,
        transcript: transcriptArr,
        employeeResponse: msg,
        stateJson: {
          turn_number: turnCount + 1,
          emotion_state: currentEmotion,
          trust_level: 5,
          issue_clarity: 5,
        },
      });

      const parsed = typeof result === "string" ? JSON.parse(result) : result;
      const reply = parsed?.customerReply || parsed?.customer_reply || {};
      const nextState = parsed?.stateUpdate || parsed?.state_update || null;
      const customerReply = reply.customer_reply || parsed.customer_reply || "...";
      const emotion = reply.updated_emotion || parsed.updated_emotion || parsed.emotion || currentEmotion;
      const nextTurnCount = typeof nextState?.turn_number === "number" ? nextState.turn_number : turnCount + 1;
      const requestedComplete = reply.scenario_complete || parsed.scenario_complete || nextState?.continue_simulation === false || false;
      const complete = requestedComplete && nextTurnCount >= 3;

      addTurn({
        role: "customer",
        message: customerReply,
        emotion,
        timestamp: Date.now(),
      });
      if (nextState) {
        addStateSnapshot(nextState);
      }

      setCurrentEmotion(emotion);
      setTurnCount(nextTurnCount);

      if (complete || nextTurnCount >= targetTurns) {
        setIsComplete(true);
      }
    } catch (err) {
      toast.error("Failed to get customer response. Try again.");
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };

  const handleEndSession = () => {
    setIsComplete(true);
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    setEvaluationStep("Evaluating performance...");
    try {
      const transcriptArr = conversation.map(t => ({
        role: t.role as "employee" | "customer",
        message: t.message,
        emotion: t.emotion,
      }));

      // Step 1: Run full evaluation pipeline
      const result = await evaluateMutation.mutateAsync({
        scenarioJson: scenario,
        transcript: transcriptArr,
        employeeRole: config.employeeRole,
        stateHistory,
      });

      const evalResult = result.evaluation as any;
      const coachingResult = result.coaching as any;
      const managerDebriefResult = result.managerDebrief as any;
      const policyGrounding = result.policyGrounding as any;
      const visibleBehavior = result.visibleBehavior as any;
      const sessionQuality = result.sessionQuality as any;
      const processingStatus = (result.processingStatus as "completed" | "invalid" | "reprocess" | undefined) || "completed";
      const processingFailure = result.failure as { message?: string } | undefined;

      // Step 2: Save session to database
      setEvaluationStep("Saving session...");
      setSaveStatus("saving");
      try {
        const persistedStateHistory = stateHistory.map((snapshot) => ({
          ...snapshot,
          employee_flags: snapshot.employee_flags ?? {},
          escalation_required: snapshot.escalation_required ?? false,
          scenario_risk_level: snapshot.scenario_risk_level ?? "moderate",
        }));
        const saveResult = await saveSessionMutation.mutateAsync({
          scenarioId: scenario.scenario_id,
          scenarioTemplateId: config.scenarioTemplateId,
          assignmentId: config.assignmentId,
          department: ((config.department || scenario.department) as "customer_service" | "golf" | "mod_emergency" | undefined),
          scenarioFamily: scenario.scenario_family || (scenario as any).issue_type,
          employeeRole: config.employeeRole,
          difficulty: scenario.difficulty,
          mode: config.mode === "phone" ? "phone" : config.mode === "live-voice" ? "live_voice" : "in_person",
          scenarioJson: scenario,
          transcript: transcriptArr,
          stateHistory: persistedStateHistory,
          turnCount: turnCount,
          policyGrounding,
          visibleBehavior,
          evaluationResult: evalResult,
          coachingResult: coachingResult,
          managerDebrief: managerDebriefResult,
          sessionQuality: sessionQuality?.session_quality,
          lowEffortResult: sessionQuality,
          overallScore: processingStatus === "completed" ? evalResult?.overall_score : undefined,
          passFail: processingStatus === "completed" ? evalResult?.pass_fail : undefined,
          readinessSignal: processingStatus === "completed" ? evalResult?.readiness_signal : undefined,
          categoryScores: processingStatus === "completed" ? evalResult?.category_scores : undefined,
          status: processingStatus,
          flagReason: processingFailure?.message || sessionQuality?.reason,
        });
        setSavedSessionId(saveResult.sessionId ?? null);
        await Promise.all([
          utils.sessions.myRecent.invalidate(),
          utils.profile.me.invalidate(),
          utils.assignments.myAssignments.invalidate(),
        ]);
        setSaveStatus("saved");
        toast.success("Session saved to history");
      } catch (saveErr) {
        console.error("[Session Save] Failed:", saveErr);
        setSaveStatus("error");
        setSavedSessionId(null);
        toast.error("Session evaluated but failed to save. Your results are still shown below.");
      }

      // Step 3: Set context state for results page
      if (evalResult) setEvaluation(evalResult);
      if (coachingResult) setCoaching(coachingResult);
      if (managerDebriefResult) setManagerDebrief(managerDebriefResult);
      if (processingStatus !== "completed") {
        toast.warning(processingFailure?.message || "This session was flagged for reprocessing.");
      }

      setLocation("/practice/results");
    } catch (err) {
      console.error("[Evaluation] Failed:", err);
      toast.error("Evaluation failed. Please try again.");
      setIsEvaluating(false);
      setEvaluationStep("");
    }
  };

  const emotionColors: Record<string, string> = {
    calm: "text-green-400",
    relieved: "text-green-400",
    concerned: "text-yellow-400",
    confused: "text-yellow-400",
    skeptical: "text-amber-400",
    frustrated: "text-amber-400",
    angry: "text-red-400",
  };

  return (
    <div className="h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 shrink-0">
        <button onClick={handleEndSession} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-mono text-teal tracking-wider uppercase">Step 2 of 3</div>
          <div className="text-sm font-medium truncate">{scenario.customer_persona?.name || "Customer"}</div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-mono ${emotionColors[currentEmotion] || "text-muted-foreground"}`}>
              {currentEmotion.toUpperCase()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Turn {turnCount}/{targetTurns}
            </span>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] border-border shrink-0">
          {config.mode === "phone" ? <Headphones className="h-3 w-3 mr-1" /> : <User className="h-3 w-3 mr-1" />}
          {config.mode === "phone" ? "Phone" : config.mode === "live-voice" ? "Live Voice" : "In-Person"}
        </Badge>
      </div>

      <div className="px-4 pt-3 shrink-0">
        <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
          <div className="h-full bg-teal transition-all" style={{ width: `${Math.min(100, (turnCount / targetTurns) * 100)}%` }} />
        </div>
        <div className="mt-2 text-[10px] font-mono text-muted-foreground tracking-wider uppercase">
          {isEvaluating ? evaluationStep || "Evaluating" : isProcessing ? "Customer responding" : isComplete ? "Ready for evaluation" : "Live session"}
        </div>
      </div>

      {/* Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {conversation.map((turn, i) => (
          <div key={i} className={`flex ${turn.role === "employee" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              turn.role === "employee"
                ? "bg-teal/10 text-foreground rounded-br-md"
                : "bg-card border border-border rounded-bl-md"
            }`}>
              {turn.role === "customer" && (
                <div className="text-[10px] font-mono text-muted-foreground mb-1">
                  {scenario.customer_persona?.name || "Customer"}
                  {turn.emotion && (
                    <span className={`ml-2 ${emotionColors[turn.emotion] || ""}`}>
                      ({turn.emotion})
                    </span>
                  )}
                </div>
              )}
              <p className="text-sm leading-relaxed">{turn.message}</p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input / Complete */}
      <div className="border-t border-border bg-card/80 backdrop-blur p-3 shrink-0 safe-area-bottom">
        {isComplete ? (
          <div className="space-y-2">
            {isEvaluating ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="h-5 w-5 animate-spin text-teal" />
                <p className="text-xs text-muted-foreground">{evaluationStep}</p>
              </div>
            ) : (
              <p className="text-xs text-center text-muted-foreground">Session complete — ready for evaluation</p>
            )}
            <Button
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="w-full h-12 bg-teal text-slate-deep hover:bg-teal/90 font-semibold gap-2 rounded-xl"
            >
              {isEvaluating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {evaluationStep || "Evaluating..."}
                </>
              ) : (
                "Get Evaluation & Score"
              )}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your response..."
              rows={1}
              className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-teal placeholder:text-muted-foreground"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              size="icon"
              className="h-12 w-12 rounded-xl bg-teal text-slate-deep hover:bg-teal/90 shrink-0"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
