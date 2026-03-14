import { useEffect, useRef, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { Mic, MicOff, PhoneOff, Loader2, User, Video, VideoOff, ChevronLeft, Wifi, WifiOff, RotateCcw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSimulator } from "@/contexts/SimulatorContext";
import { useLiveVoiceSession } from "@/features/live-voice/useLiveVoiceSession";
import { familyLabels } from "@/features/simulator/config";
import { getLiveVoiceGuidance } from "@/features/live-voice/ux";

const stateLabels: Record<string, string> = {
  idle: "Ready",
  requesting_permissions: "Microphone",
  requesting_credentials: "Preparing",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  fallback: "Fallback",
  ended: "Ended",
  error: "Error",
};

const stateClasses: Record<string, string> = {
  idle: "bg-muted/10 text-muted-foreground",
  requesting_permissions: "bg-amber-500/10 text-amber-400",
  requesting_credentials: "bg-amber-500/10 text-amber-400",
  connecting: "bg-amber-500/10 text-amber-400",
  connected: "bg-green-500/10 text-green-400",
  reconnecting: "bg-amber-500/10 text-amber-400",
  fallback: "bg-red-500/10 text-red-400",
  ended: "bg-muted/10 text-muted-foreground",
  error: "bg-red-500/10 text-red-400",
};

const guidanceToneClasses = {
  neutral: "border-border bg-background/60 text-foreground",
  info: "border-teal/20 bg-teal/5 text-foreground",
  warning: "border-amber-500/20 bg-amber-500/5 text-foreground",
  success: "border-green-500/20 bg-green-500/5 text-foreground",
  danger: "border-red-500/20 bg-red-500/5 text-foreground",
} as const;

export default function LiveVoiceSession() {
  const [, setLocation] = useLocation();
  const {
    scenario,
    config,
    setConfig,
    setEvaluation,
    setCoaching,
    setManagerDebrief,
    setSaveStatus,
    setSavedSessionId,
  } = useSimulator();
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [manualReply, setManualReply] = useState("");
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const finalizedRef = useRef(false);
  const selfVideoRef = useRef<HTMLVideoElement | null>(null);
  const utils = trpc.useUtils();
  const evaluateMutation = trpc.simulator.evaluate.useMutation();
  const saveSessionMutation = trpc.simulator.saveSession.useMutation();

  const liveSession = useLiveVoiceSession({
    scenario: scenario as any,
    config,
  });

  useEffect(() => {
    if (!scenario) return;
    void liveSession.startCall();
  }, [scenario]);

  useEffect(() => {
    if (!selfVideoRef.current) return;
    selfVideoRef.current.srcObject = liveSession.selfVideoStream;
  }, [liveSession.selfVideoStream]);

  useEffect(() => {
    if (finalizedRef.current) return;
    if (!liveSession.terminalStateValidated) return;
    void finishSession();
  }, [liveSession.terminalStateValidated]);

  if (!scenario) return <Redirect to="/practice" />;

  const finishSession = async () => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    setIsFinalizing(true);
    setSaveStatus("saving");

    try {
      const result = await evaluateMutation.mutateAsync({
        scenarioJson: scenario,
        transcript: liveSession.transcript,
        employeeRole: config.employeeRole,
        stateHistory: liveSession.stateHistory,
      });

      const evalResult = result.evaluation as any;
      const coachingResult = result.coaching as any;
      const managerDebriefResult = result.managerDebrief as any;
      const policyGrounding = result.policyGrounding as any;
      const visibleBehavior = result.visibleBehavior as any;
      const sessionQuality = result.sessionQuality as any;
      const processingStatus = (result.processingStatus as "completed" | "invalid" | "reprocess" | undefined) || "completed";
      const processingFailure = result.failure as { message?: string } | undefined;

      const saveResult = await saveSessionMutation.mutateAsync({
        scenarioId: scenario.scenario_id,
        scenarioTemplateId: config.scenarioTemplateId,
        assignmentId: config.assignmentId,
        department: (config.department || scenario.department) as "customer_service" | "golf" | "mod_emergency" | undefined,
        scenarioFamily: scenario.scenario_family || (scenario as any).issue_type,
        employeeRole: config.employeeRole,
        difficulty: scenario.difficulty,
        mode: "live_voice",
        scenarioJson: scenario,
        transcript: liveSession.transcript,
        turnEvents: liveSession.turnEvents,
        timingMarkers: liveSession.timingMarkers,
        stateHistory: liveSession.stateHistory.map((snapshot) => ({
          ...snapshot,
          employee_flags: snapshot.employee_flags ?? {},
          escalation_required: snapshot.escalation_required ?? false,
          scenario_risk_level: snapshot.scenario_risk_level ?? "moderate",
        })),
        policyGrounding,
        visibleBehavior,
        evaluationResult: evalResult,
        coachingResult,
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

      if (evalResult) setEvaluation(evalResult);
      if (coachingResult) setCoaching(coachingResult);
      if (managerDebriefResult) setManagerDebrief(managerDebriefResult);
      setSavedSessionId(saveResult.sessionId ?? null);
      await Promise.all([
        utils.sessions.myRecent.invalidate(),
        utils.profile.me.invalidate(),
        utils.assignments.myAssignments.invalidate(),
      ]);
      setSaveStatus("saved");
      if (processingStatus !== "completed") {
        toast.warning(processingFailure?.message || "This live session was flagged for reprocessing.");
      }
      setLocation("/practice/results");
    } catch (error) {
      console.error("[Live Voice] finalize failed", error);
      setSaveStatus("error");
      setSavedSessionId(null);
      toast.error("The live session ended, but evaluation or save failed.");
      finalizedRef.current = false;
      setIsFinalizing(false);
    }
  };

  const handleEndCall = () => {
    liveSession.endCall();
  };

  const switchToTextPractice = () => {
    setConfig({
      ...config,
      mode: "in-person",
    });
    setLocation("/practice/session");
  };

  const canToggleVideo = liveSession.sessionActive && !isFinalizing;
  const modeLabel = config.mode === "live-voice" ? "Live Voice Call" : "Voice Session";
  const callerLabel = scenario.customer_persona?.membership_context
    || familyLabels[scenario.scenario_family || ""]
    || scenario.scenario_family
    || "Customer interaction";
  const isFallbackMode = liveSession.connectionState === "fallback";
  const isVoiceReady = liveSession.connectionState === "connected" || liveSession.connectionState === "connecting" || liveSession.connectionState === "reconnecting";
  const latestState = liveSession.stateHistory[liveSession.stateHistory.length - 1] || null;
  const guidance = getLiveVoiceGuidance({
    connectionState: liveSession.connectionState,
    voiceMode: liveSession.voiceMode,
    assistantPhase: liveSession.assistantPhase,
    isMuted: liveSession.isMuted,
    transcriptTurns: liveSession.transcript.length,
    latestState,
    sessionActive: liveSession.sessionActive,
    terminalStateValidated: liveSession.terminalStateValidated,
    complaintStillOpen: liveSession.complaintStillOpen,
    liveRuntimeFailureState: liveSession.liveRuntimeFailureState,
    lastError: liveSession.lastError,
  });

  const handleManualReply = async () => {
    const text = manualReply.trim();
    if (!text) return;
    try {
      setIsSubmittingManual(true);
      await liveSession.submitManualResponse(text);
      setManualReply("");
    } catch (error) {
      console.error("[Live Voice] manual reply failed", error);
      toast.error("Typed reply could not be sent.");
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-border bg-card/80 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setLocation("/practice/intro")} className="text-muted-foreground hover:text-foreground" disabled={isFinalizing}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center flex-1 min-w-0">
            <div className="text-[10px] font-mono tracking-wider uppercase text-teal">Call Live</div>
            <div className="text-sm font-semibold truncate">{scenario.customer_persona?.name || "Customer"}</div>
            <div className="text-xs text-muted-foreground truncate">{modeLabel} · {callerLabel}</div>
          </div>
          <Badge variant="outline" className={`border-0 ${stateClasses[liveSession.connectionState] || stateClasses.idle}`}>
            {liveSession.connectionState === "connected" ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
            {stateLabels[liveSession.connectionState] || liveSession.connectionState}
          </Badge>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-4 py-5 gap-5 max-w-lg mx-auto w-full">
        <div className="panel p-5 text-center space-y-3">
          <div className="inline-flex w-20 h-20 items-center justify-center rounded-full bg-teal/10 border border-teal/20">
            <User className="h-9 w-9 text-teal" />
          </div>
          <div>
            <div className="text-lg font-semibold">{scenario.customer_persona?.name}</div>
            <div className="text-sm text-muted-foreground">{callerLabel}</div>
          </div>
          <div className="text-xs text-muted-foreground">{scenario.situation_summary}</div>
          <div className="text-3xl font-mono font-bold tracking-tight">{liveSession.formattedDuration}</div>
          {!isVoiceReady && (
            <div className="text-sm text-muted-foreground">
              {liveSession.credentialPending || liveSession.connectionState === "connecting" || liveSession.connectionState === "requesting_credentials"
                ? "Starting secure audio session..."
                : liveSession.lastError || "Waiting for connection."}
            </div>
          )}
          {isFallbackMode && (
            <div className="space-y-3 pt-2">
              <div className="text-sm text-amber-400">
                Live voice is not available in this local setup. Switch this same caller into a typed conversation.
              </div>
              <Button
                onClick={switchToTextPractice}
                className="w-full bg-teal text-slate-deep hover:bg-teal/90"
              >
                Switch to Typed Conversation
              </Button>
            </div>
          )}
          {liveSession.connectionState === "connected" && liveSession.lastError && (
            <div className="text-sm text-teal">
              {liveSession.lastError}
            </div>
          )}
        </div>

        <div className={`panel p-4 space-y-2 border ${guidanceToneClasses[guidance.tone]}`}>
          <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground">Call Status</div>
          <div className="text-sm font-semibold">{guidance.title}</div>
          <div className="text-sm text-muted-foreground">{guidance.detail}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground mb-2">Connection</div>
            <div className="text-sm font-medium">{stateLabels[liveSession.connectionState]}</div>
            <div className="text-xs text-muted-foreground mt-1 capitalize">{liveSession.voiceMode.replace("_", " ")}</div>
          </div>
          <div className="panel p-4">
            <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground mb-2">Microphone</div>
            <div className="text-sm font-medium">{liveSession.isMuted ? "Paused" : "Live"}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {liveSession.isMuted ? "Resume when you are ready to answer." : "Your mic is ready for the next reply."}
            </div>
          </div>
        </div>

        <div className="panel p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground">Self Video</div>
              <div className="text-sm text-muted-foreground">Optional preview only. Not required for voice transport.</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void liveSession.toggleSelfVideo()} disabled={!canToggleVideo} className="gap-2">
              {liveSession.selfVideoEnabled ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
              {liveSession.selfVideoEnabled ? "Hide" : "Show"}
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-background/60 overflow-hidden min-h-40 flex items-center justify-center">
            {liveSession.selfVideoEnabled && liveSession.selfVideoStream ? (
              <video ref={selfVideoRef} autoPlay muted playsInline className="w-full h-56 object-cover" />
            ) : (
              <div className="text-sm text-muted-foreground">Self video is off</div>
            )}
          </div>
        </div>

        <div className="panel p-4 space-y-3">
          <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground">Live Transcript</div>
          {liveSession.draftTranscript && (
            <div className="rounded-lg border border-teal/20 bg-teal/5 p-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-teal">Heard so far</div>
              <div className="text-sm mt-1">{liveSession.draftTranscript}</div>
            </div>
          )}
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {liveSession.transcript.length === 0 ? (
              <div className="text-sm text-muted-foreground">Transcript will appear here as audio transcription events arrive.</div>
            ) : (
              liveSession.transcript.slice(-6).map((turn, index) => (
                <div key={`${turn.role}-${turn.timestamp}-${index}`} className={`rounded-lg border p-3 ${turn.role === "customer" ? "border-red-500/10 bg-red-500/5" : "border-teal/10 bg-teal/5"}`}>
                  <div className={`text-[10px] font-mono uppercase tracking-wider ${turn.role === "customer" ? "text-red-400" : "text-teal"}`}>{turn.role}</div>
                  <div className="text-sm mt-1">{turn.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {liveSession.voiceMode === "browser_voice" && !isFallbackMode && (
          <div className="panel p-4 space-y-3">
            <div className="text-[10px] font-mono tracking-wider uppercase text-muted-foreground">Manual Backup Reply</div>
            <div className="text-sm text-muted-foreground">
              If voice recognition misses your answer, type it here and send it into the same live scenario.
            </div>
            <Textarea
              value={manualReply}
              onChange={(event) => setManualReply(event.target.value)}
              placeholder="Type the response you would say out loud..."
              className="min-h-24"
              disabled={isFinalizing || isSubmittingManual}
            />
            <Button
              type="button"
              className="w-full gap-2 bg-teal text-slate-deep hover:bg-teal/90"
              onClick={() => void handleManualReply()}
              disabled={isFinalizing || isSubmittingManual || manualReply.trim().length === 0}
            >
              {isSubmittingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isSubmittingManual ? "Sending reply" : "Send typed reply"}
            </Button>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 bg-card/90 backdrop-blur border-t border-border px-4 py-4">
        {isFallbackMode && !isFinalizing ? (
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <Button
              type="button"
              className="flex-1 h-14 rounded-xl bg-teal text-slate-deep hover:bg-teal/90"
              onClick={switchToTextPractice}
            >
              Switch to Typed Conversation
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-14 rounded-xl"
              onClick={() => setLocation("/practice/intro")}
            >
              Back to Call Brief
            </Button>
          </div>
        ) : (
          <div className="max-w-lg mx-auto grid grid-cols-3 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-xl gap-2"
              onClick={() => liveSession.toggleMute()}
              disabled={isFinalizing || liveSession.connectionState === "requesting_permissions" || liveSession.connectionState === "requesting_credentials"}
            >
              {liveSession.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {liveSession.isMuted ? "Resume Mic" : "Pause Mic"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 rounded-xl gap-2"
              onClick={() => void liveSession.repeatLastCustomerMessage()}
              disabled={isFinalizing || liveSession.transcript.filter((turn) => turn.role === "customer").length === 0}
            >
              <RotateCcw className="h-5 w-5" />
              Repeat
            </Button>
            <Button
              type="button"
              className="h-14 rounded-xl bg-red-500 text-white hover:bg-red-500/90 gap-2"
              onClick={() => void handleEndCall()}
              disabled={isFinalizing}
            >
              {isFinalizing ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
              {isFinalizing ? "Finalizing" : "End Call"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
