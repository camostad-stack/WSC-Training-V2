import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, MessageSquare, Shield, Eye, BarChart3, FileText, PlayCircle, User, AlertTriangle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { departmentLabels, familyLabels } from "@/features/simulator/config";
import { buildPostCallDebrief } from "@/features/simulator/debrief";

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    return (value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function formatLabel(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "--";
}

function passFailClasses(value?: string | null) {
  if (value === "pass") return "text-green-400 bg-green-500/10";
  if (value === "fail") return "text-red-400 bg-red-500/10";
  return "text-amber-400 bg-amber-500/10";
}

function reviewClasses(value?: string | null) {
  if (value === "reviewed") return "text-teal bg-teal/10";
  if (value === "overridden") return "text-amber bg-amber/10";
  if (value === "flagged") return "text-red-400 bg-red-500/10";
  return "text-muted-foreground bg-muted/10";
}

function readinessClasses(value?: string | null) {
  if (value === "independent") return "text-green-400 bg-green-500/10";
  if (value === "partially_independent") return "text-teal bg-teal/10";
  if (value === "shadow_ready") return "text-amber-400 bg-amber-500/10";
  return "text-red-400 bg-red-500/10";
}

export default function SessionDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const sessionId = parseInt(params.id || "0", 10);

  const session = trpc.sessions.getById.useQuery({ id: sessionId }, { retry: false, enabled: sessionId > 0 });
  const sessionData = session.data;
  const employeeId = sessionData?.userId ?? 0;
  const scenarioQueryInput = useMemo(
    () => (sessionData?.department ? { department: sessionData.department, isActive: true } : { isActive: true }),
    [sessionData?.department],
  );

  const reviews = trpc.reviews.getForSession.useQuery({ sessionId }, { retry: false, enabled: sessionId > 0 });
  const media = trpc.sessions.getMedia.useQuery({ sessionId }, { retry: false, enabled: sessionId > 0 });
  const profile = trpc.profile.getByUserId.useQuery({ userId: employeeId }, { retry: false, enabled: employeeId > 0 });
  const scenarios = trpc.scenarios.list.useQuery(scenarioQueryInput, { retry: false, enabled: sessionId > 0 });

  const [reviewForm, setReviewForm] = useState({
    overrideScore: "",
    overrideReason: "",
    managerNotes: "",
    performanceSignal: "yellow" as "green" | "yellow" | "red",
    followUpRequired: false,
    followUpAction: "",
    shadowingNeeded: false,
    assignedNextDrillTemplateId: "none",
  });

  const reviewMutation = trpc.reviews.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.sessions.getById.invalidate({ id: sessionId }),
        utils.sessions.teamSessions.invalidate(),
        utils.reviews.getForSession.invalidate({ sessionId }),
        utils.team.dashboard.invalidate(),
        employeeId > 0 ? utils.profile.getByUserId.invalidate({ userId: employeeId }) : Promise.resolve(),
        employeeId > 0 ? utils.assignments.teamAssignments.invalidate({ employeeId }) : Promise.resolve(),
      ]);
      toast.success("Review saved");
    },
    onError: (error) => toast.error(error.message),
  });

  if (session.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  if (session.isError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/manage/sessions")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-red-400">This session could not be loaded.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => session.refetch()}>
                Retry
              </Button>
              <Button variant="ghost" onClick={() => setLocation("/manage/sessions")}>
                Return to Queue
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const s = sessionData;
  if (!s) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/manage/sessions")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Session not found</p>
      </div>
    );
  }

  const transcript = parseJson<any[]>(s.transcript, []);
  const turnEvents = parseJson<any[]>(s.turnEvents, []);
  const timingMarkers = parseJson<any[]>(s.timingMarkers, []);
  const stateHistory = parseJson<any[]>(s.stateHistory, []);
  const finalState = stateHistory[stateHistory.length - 1] || {};
  const evaluation = parseJson<any>(s.evaluationResult, {});
  const coaching = parseJson<any>(s.coachingResult, {});
  const policyGrounding = parseJson<any>(s.policyGrounding, {});
  const managerDebrief = parseJson<any>(s.managerDebrief, {});
  const categoryScores = evaluation.category_scores || s.categoryScores || {};
  const scoreDimensions = (evaluation.score_dimensions || null) as Record<string, number> | null;
  const mediaItems = media.data || [];
  const reviewHistory = reviews.data || [];
  const readinessStatus = profile.data?.readinessStatus || s.readinessSignal || "not_ready";
  const readinessTrend = profile.data?.trend || "flat";
  const availableDrills = (scenarios.data || []).filter((template: any) => template.isActive);
  const debrief = useMemo(() => buildPostCallDebrief({
    stateHistory,
    evaluation,
    coaching,
    managerDebrief,
  }), [stateHistory, evaluation, coaching, managerDebrief]);
  const overrideScore = reviewForm.overrideScore ? parseInt(reviewForm.overrideScore, 10) : undefined;
  const isOverride = overrideScore !== undefined && overrideScore !== (s.overallScore ?? undefined);
  const reviewTabDefault = s.reviewStatus === "pending" ? "review" : "evidence";
  const secondaryQueryWarnings = [
    media.isError ? "Replay media is unavailable." : null,
    reviews.isError ? "Review history could not be loaded." : null,
    profile.isError ? "Employee readiness data is unavailable." : null,
    scenarios.isError ? "Follow-up drill options could not be loaded." : null,
  ].filter(Boolean) as string[];

  const handleSubmitReview = () => {
    reviewMutation.mutate({
      sessionId: s.id,
      employeeId: s.userId,
      originalScore: s.overallScore ?? undefined,
      overrideScore,
      overrideReason: reviewForm.overrideReason.trim() || undefined,
      managerNotes: reviewForm.managerNotes.trim() || undefined,
      performanceSignal: reviewForm.performanceSignal,
      followUpRequired: reviewForm.followUpRequired,
      followUpAction: reviewForm.followUpAction.trim() || undefined,
      shadowingNeeded: reviewForm.shadowingNeeded,
      assignedNextDrillTemplateId: reviewForm.assignedNextDrillTemplateId !== "none"
        ? parseInt(reviewForm.assignedNextDrillTemplateId, 10)
        : undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Sessions
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Completed Session #{s.id}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(s.createdAt).toLocaleString()} | {departmentLabels[s.department as keyof typeof departmentLabels] || formatLabel(s.department)} | {familyLabels[s.scenarioFamily as keyof typeof familyLabels] || formatLabel(s.scenarioFamily)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <Badge variant="outline" className={`border-0 ${passFailClasses(s.passFail)}`}>
            {s.passFail || "pending"}
          </Badge>
          <Badge variant="outline" className={`border-0 ${reviewClasses(s.reviewStatus)}`}>
            {s.reviewStatus === "pending" ? "Needs review" : formatLabel(s.reviewStatus)}
          </Badge>
          <span className="font-mono text-lg font-bold">{s.overallScore ?? "--"}/100</span>
        </div>
      </div>

      {secondaryQueryWarnings.length > 0 && (
        <Card className="bg-card border-amber-500/20">
          <CardContent className="p-4 space-y-2">
            {secondaryQueryWarnings.map((warning) => (
              <div key={warning} className="flex items-center gap-2 text-sm text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Employee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-teal" />
              <div>
                <div className="text-sm font-medium">Employee #{s.userId}</div>
                <div className="text-xs text-muted-foreground">Role: {s.employeeRole}</div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setLocation(`/manage/team/${s.userId}`)}>
              View Readiness
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="outline" className={`border-0 ${readinessClasses(readinessStatus)}`}>
              {formatLabel(readinessStatus)}
            </Badge>
            <div className="text-xs text-muted-foreground">Trend: {formatLabel(readinessTrend)}</div>
            <div className="text-xs text-muted-foreground">Profile sessions: {profile.data?.totalSessions ?? "--"}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Scenario State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Difficulty: <span className="font-mono">{s.difficulty}</span></div>
            <div>Mode: <span className="font-mono">{formatLabel(s.mode)}</span></div>
            <div>Turns recorded: <span className="font-mono">{s.turnCount || transcript.length}</span></div>
            <div>Status: <span className="capitalize">{formatLabel(s.status)}</span></div>
            {s.isFlagged && (
              <div className="text-red-400 text-xs">
                Flagged{ s.flagReason ? `: ${s.flagReason}` : "" }
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>AI summary: <span className="text-muted-foreground">{evaluation.summary || "No summary"}</span></div>
            <div>Important correction: <span className="text-muted-foreground">{evaluation.most_important_correction || "None"}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
            Post-Call Outcome Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`border-0 ${
              debrief.isActuallyResolved || debrief.escalationWasValid
                ? "text-green-400 bg-green-500/10"
                : debrief.outcomeState === "PARTIALLY_RESOLVED"
                  ? "text-amber-400 bg-amber-500/10"
                  : "text-red-400 bg-red-500/10"
            }`}>
              {formatLabel(debrief.outcomeState)}
            </Badge>
            <Badge variant="outline" className="border-0 bg-secondary/50 text-muted-foreground">
              Accepted next step: {debrief.hasValidNextStep ? "yes" : "no"}
            </Badge>
            <Badge variant="outline" className="border-0 bg-secondary/50 text-muted-foreground">
              Valid escalation: {debrief.escalationWasValid ? "yes" : "no"}
            </Badge>
            {debrief.prematureClosureAttempted && (
              <Badge variant="outline" className="border-0 bg-red-500/10 text-red-400">
                Premature closure detected
              </Badge>
            )}
          </div>
          <div className="rounded-lg border border-border p-4 bg-background/40">
            <div className="text-xs font-mono tracking-wider uppercase text-muted-foreground mb-2">
              Why This Did Or Did Not Count As Complete
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{debrief.whyThisDidOrDidNotCountAsComplete}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <div>Issue progress: <span className="font-mono">{formatLabel(finalState.issue_progress_state || finalState.goal_status)}</span></div>
              <div>Confidence in employee: <span className="font-mono">{finalState.confidence_in_employee ?? "--"}/10</span></div>
              <div>Trust level: <span className="font-mono">{finalState.trust_level ?? "--"}/10</span></div>
            </div>
            <div className="space-y-1">
              <div>Next step owner: <span className="text-muted-foreground">{finalState.next_step_owner || "--"}</span></div>
              <div>Next step timeline: <span className="text-muted-foreground">{finalState.next_step_timeline || "--"}</span></div>
              <div>Willing to escalate: <span className="font-mono">{finalState.willingness_to_escalate ?? "--"}/10</span></div>
            </div>
            <div className="space-y-2">
              <div className="text-muted-foreground">What the customer still needed</div>
              {debrief.customerStillNeeded.length === 0 ? (
                <div className="text-sm">Nothing material remained open.</div>
              ) : (
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                  {debrief.customerStillNeeded.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-muted-foreground">Outcome summary</div>
              <div className="text-sm">{debrief.outcomeSummary || "No hidden outcome summary captured."}</div>
              {debrief.unmetCompletionCriteria.length > 0 && (
                <div className="space-y-1">
                  <div className="text-muted-foreground">Unmet completion criteria</div>
                  <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                    {debrief.unmetCompletionCriteria.slice(0, 4).map((criterion) => (
                      <li key={criterion}>{criterion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={reviewTabDefault}>
        <TabsList className="bg-secondary/50 border border-border flex flex-wrap h-auto">
          <TabsTrigger value="evidence" className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> Evidence</TabsTrigger>
          <TabsTrigger value="transcript" className="gap-1.5 text-xs"><MessageSquare className="h-3.5 w-3.5" /> Transcript</TabsTrigger>
          <TabsTrigger value="result" className="gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" /> Result</TabsTrigger>
          <TabsTrigger value="policy" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" /> Policy</TabsTrigger>
          <TabsTrigger value="review" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> Review</TabsTrigger>
        </TabsList>

        <TabsContent value="evidence" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Replay / Uploaded Media
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {media.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading media
                </div>
              ) : media.isError ? (
                <p className="text-sm text-red-400">Replay media could not be loaded for this session.</p>
              ) : mediaItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No replay uploaded for this session. Review the transcript and result tabs below.
                </p>
              ) : (
                mediaItems.map((item: any) => (
                  <div key={item.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <PlayCircle className="h-4 w-4 text-teal" />
                        <div>
                          <div className="text-sm font-medium capitalize">{item.mediaType.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground">
                            Uploaded {new Date(item.createdAt).toLocaleString()}
                            {item.durationSeconds ? ` | ${item.durationSeconds}s` : ""}
                            {item.turnNumber ? ` | Turn ${item.turnNumber}` : ""}
                          </div>
                        </div>
                      </div>
                      <a href={item.storageUrl} target="_blank" rel="noreferrer" className="text-xs text-teal underline">
                        Open file
                      </a>
                    </div>
                    {item.mediaType === "video" && (
                      <video controls src={item.storageUrl} className="w-full rounded-lg border border-border bg-background" />
                    )}
                    {item.mediaType === "audio" && (
                      <audio controls src={item.storageUrl} className="w-full" />
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                State Progression
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stateHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No state history available.</p>
              ) : (
                stateHistory.map((state: any, index: number) => (
                  <div key={index} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">Turn {state.turn_number ?? index + 1}</div>
                      <Badge variant="outline" className="border-0 bg-secondary/50 text-muted-foreground">
                        {formatLabel(state.emotion_state)}
                      </Badge>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3 text-xs text-muted-foreground">
                      <div>Trust: <span className="font-mono text-foreground">{state.trust_level ?? "--"}</span></div>
                      <div>Issue clarity: <span className="font-mono text-foreground">{state.issue_clarity ?? "--"}</span></div>
                      <div>Risk: <span className="font-mono text-foreground">{formatLabel(state.scenario_risk_level)}</span></div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {(timingMarkers.length > 0 || turnEvents.length > 0) && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                  Live Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {timingMarkers.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Timing markers</div>
                    {timingMarkers.map((marker: any, index: number) => (
                      <div key={`${marker.name}-${index}`} className="flex items-center justify-between text-sm border border-border rounded-lg px-3 py-2">
                        <div>
                          <div className="font-medium">{formatLabel(marker.name)}</div>
                          {marker.detail && <div className="text-xs text-muted-foreground">{marker.detail}</div>}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{Math.round((marker.atMs || 0) / 1000)}s</div>
                      </div>
                    ))}
                  </div>
                )}
                {turnEvents.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Realtime events</div>
                    <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                      {turnEvents.length} events captured for this live voice session.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Conversation Transcript
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {transcript.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transcript available.</p>
              ) : (
                transcript.map((turn: any, index: number) => (
                  <div key={index} className={`rounded-lg border p-3 ${turn.role === "customer" ? "bg-red-500/5 border-red-500/10" : "bg-teal/5 border-teal/10"}`}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${turn.role === "customer" ? "text-red-400" : "text-teal"}`}>
                        {turn.role === "customer" ? "Customer" : "Employee"}
                      </span>
                      {turn.emotion && (
                        <Badge variant="outline" className="border-0 bg-secondary/50 text-[9px] text-muted-foreground">
                          {turn.emotion}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{turn.content || turn.text || turn.message}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="result" className="mt-4 space-y-4">
          {scoreDimensions && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                  Outcome vs Interaction
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{debrief.interactionVsOutcomeNote}</p>
                <div className="grid gap-3 lg:grid-cols-3">
                  {Object.entries(scoreDimensions).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border p-3">
                      <div className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, " ")}</div>
                      <div className="mt-1 font-mono text-lg">{value}/100</div>
                      <div className="mt-2">
                        <Progress value={value} className="h-2" />
                      </div>
                    </div>
                  ))}
                </div>
                {debrief.polishedButUnresolved && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-300">
                    This session sounded more polished than it was operationally complete.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Where Trust Moved</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {debrief.whereTrustMoved.map((item) => (
                  <div key={item} className="text-sm text-muted-foreground">- {item}</div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">What Changed The Customer’s Tone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(debrief.whatChangedCustomerTone.length > 0 ? debrief.whatChangedCustomerTone : debrief.emotionalProgression).map((item) => (
                  <div key={item} className="text-sm text-muted-foreground">- {item}</div>
                ))}
              </CardContent>
            </Card>
          </div>

          {debrief.prematureClosureAttempts.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                  Premature Closure Attempts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {debrief.prematureClosureAttempts.map((attempt) => (
                  <div key={`${attempt.turn}-${attempt.trigger}`} className="rounded-lg border border-border p-3">
                    <div className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
                      Turn {attempt.turn}
                    </div>
                    <div className="mt-1 text-sm">Trigger: <span className="text-muted-foreground">{attempt.trigger}</span></div>
                    <div className="mt-2 text-sm text-muted-foreground">Customer reaction: {attempt.customerReaction}</div>
                    <div className="mt-2 text-sm text-muted-foreground">Recovery: {attempt.recovery}</div>
                    {attempt.unresolvedGaps.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1">
                          Still unresolved at that moment
                        </div>
                        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                          {attempt.unresolvedGaps.slice(0, 4).map((gap) => (
                            <li key={gap}>{gap}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Missed Moments Tied To Turns</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {debrief.missedMoments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No specific missed-turn callouts were generated.</p>
                ) : (
                  debrief.missedMoments.map((moment) => (
                    <div key={`${moment.turn}-${moment.title}`} className="rounded-lg border border-border p-3">
                      <div className="text-xs font-mono tracking-wider uppercase text-muted-foreground">
                        Turn {moment.turn} · {moment.title}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{moment.detail}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Replay Focus</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {debrief.bestRecoveryMoment && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-mono mb-1">Best recovery moment</div>
                    <p className="text-sm text-muted-foreground">{debrief.bestRecoveryMoment}</p>
                  </div>
                )}
                {debrief.unresolvedTooLong && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-300">
                    The conversation stayed unresolved too long before it moved toward a usable outcome.
                  </div>
                )}
                {debrief.reliedOnVagueFollowUp && (
                  <div className="text-sm text-muted-foreground">- The employee relied on vague follow-up language instead of naming the owner, action, and timeline.</div>
                )}
                {debrief.policyWithoutOwnership && (
                  <div className="text-sm text-muted-foreground">- Policy was used without enough ownership or a usable next step.</div>
                )}
                {debrief.recommendedReplayFocus.map((item) => (
                  <div key={item} className="text-sm text-muted-foreground">- {item}</div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Category Scores
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(categoryScores).length === 0 ? (
                <p className="text-sm text-muted-foreground">No category scores available.</p>
              ) : (
                Object.entries(categoryScores).map(([key, value]: [string, any]) => (
                  <div key={key}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                      <span className="font-mono">{value}/10</span>
                    </div>
                    <Progress value={(value as number) * 10} className="h-1.5" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Strengths</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(evaluation.best_moments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No strength highlights.</p>
                ) : (
                  (evaluation.best_moments || []).map((moment: string, index: number) => (
                    <div key={index} className="text-sm text-green-400">+ {moment}</div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Corrections</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(evaluation.missed_moments || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No misses captured.</p>
                ) : (
                  (evaluation.missed_moments || []).map((moment: string, index: number) => (
                    <div key={index} className="text-sm text-amber-400">- {moment}</div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Coaching</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{coaching.employee_coaching_summary || "No coaching summary available."}</p>
                {(coaching.do_this_next_time || []).length > 0 && (
                  <div>
                    <div className="mb-2 text-xs font-mono tracking-wider uppercase text-muted-foreground">Do Next Time</div>
                    <div className="space-y-1">
                      {(coaching.do_this_next_time || []).map((item: string, index: number) => (
                        <div key={index} className="text-sm">- {item}</div>
                      ))}
                    </div>
                  </div>
                )}
                {coaching.practice_focus && (
                  <div className="text-xs text-muted-foreground">
                    Practice focus: <span className="text-foreground">{coaching.practice_focus}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Manager Debrief</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{managerDebrief.manager_summary || "No manager debrief available."}</p>
                {managerDebrief.recommended_follow_up_action && (
                  <div className="text-xs text-muted-foreground">
                    Follow-up: <span className="text-foreground">{managerDebrief.recommended_follow_up_action}</span>
                  </div>
                )}
                {managerDebrief.recommended_next_drill && (
                  <div className="text-xs text-muted-foreground">
                    Recommended next drill: <span className="text-foreground">{formatLabel(managerDebrief.recommended_next_drill)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="policy" className="mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Policy Grounding Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Accuracy:</span>
                <Badge variant="outline" className={`border-0 ${
                  policyGrounding.policy_accuracy === "correct" ? "text-green-400 bg-green-500/10" :
                  policyGrounding.policy_accuracy === "partially_correct" ? "text-amber-400 bg-amber-500/10" :
                  "text-red-400 bg-red-500/10"
                }`}>
                  {policyGrounding.policy_accuracy || "not evaluated"}
                </Badge>
              </div>
              {(policyGrounding.matched_policy_points || []).length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Matched Points</div>
                  <div className="mt-1 space-y-1">
                    {(policyGrounding.matched_policy_points || []).map((point: string, index: number) => (
                      <div key={index} className="text-sm text-green-400">+ {point}</div>
                    ))}
                  </div>
                </div>
              )}
              {(policyGrounding.missed_policy_points || []).length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground">Missed Points</div>
                  <div className="mt-1 space-y-1">
                    {(policyGrounding.missed_policy_points || []).map((point: string, index: number) => (
                      <div key={index} className="text-sm text-red-400">- {point}</div>
                    ))}
                  </div>
                </div>
              )}
              {policyGrounding.policy_notes && (
                <p className="text-sm text-muted-foreground">{policyGrounding.policy_notes}</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="review" className="mt-4 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Manager Review & Override
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Override Score</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={reviewForm.overrideScore}
                    onChange={(event) => setReviewForm({ ...reviewForm, overrideScore: event.target.value })}
                    placeholder={`AI score: ${s.overallScore ?? "--"}`}
                    className="bg-background border-border"
                  />
                  {isOverride && !reviewForm.overrideReason.trim() && (
                    <p className="mt-1 text-xs text-amber-400">Override reason is required when changing the score.</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Performance Signal</Label>
                  <Select value={reviewForm.performanceSignal} onValueChange={(value: any) => setReviewForm({ ...reviewForm, performanceSignal: value })}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="green">Green - On track</SelectItem>
                      <SelectItem value="yellow">Yellow - Needs attention</SelectItem>
                      <SelectItem value="red">Red - Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isOverride && (
                <div>
                  <Label className="text-xs">Override Reason</Label>
                  <Textarea
                    value={reviewForm.overrideReason}
                    onChange={(event) => setReviewForm({ ...reviewForm, overrideReason: event.target.value })}
                    placeholder="Required when changing the score."
                    className="bg-background border-border"
                  />
                </div>
              )}

              <div>
                <Label className="text-xs">Manager Notes</Label>
                <Textarea
                  value={reviewForm.managerNotes}
                  onChange={(event) => setReviewForm({ ...reviewForm, managerNotes: event.target.value })}
                  placeholder="Operational coaching notes, callouts, or follow-up context."
                  className="bg-background border-border"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Assign Next Drill</Label>
                  <Select
                    value={reviewForm.assignedNextDrillTemplateId}
                    onValueChange={(value) => setReviewForm({
                      ...reviewForm,
                      assignedNextDrillTemplateId: value,
                      followUpRequired: value === "none" ? reviewForm.followUpRequired : true,
                    })}
                  >
                    <SelectTrigger className="bg-background border-border">
                      <SelectValue placeholder="Select a scenario template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No follow-up drill</SelectItem>
                      {availableDrills.map((template: any) => (
                        <SelectItem key={template.id} value={String(template.id)}>
                          {template.title} | {familyLabels[template.scenarioFamily as keyof typeof familyLabels] || formatLabel(template.scenarioFamily)} | L{template.difficulty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {scenarios.isError && (
                    <p className="mt-1 text-xs text-red-400">Next-drill templates are unavailable right now.</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Follow-up Action</Label>
                  <Input
                    value={reviewForm.followUpAction}
                    onChange={(event) => setReviewForm({ ...reviewForm, followUpAction: event.target.value })}
                    placeholder="Schedule coaching, repeat drill, live shadow."
                    className="bg-background border-border"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewForm.followUpRequired}
                    onChange={(event) => setReviewForm({ ...reviewForm, followUpRequired: event.target.checked })}
                    className="rounded border-border"
                  />
                  Follow-up required
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reviewForm.shadowingNeeded}
                    onChange={(event) => setReviewForm({ ...reviewForm, shadowingNeeded: event.target.checked })}
                    className="rounded border-border"
                  />
                  Live shadowing needed
                </label>
              </div>

              <Button
                onClick={handleSubmitReview}
                disabled={reviewMutation.isPending || (isOverride && !reviewForm.overrideReason.trim())}
                className="w-full bg-teal text-slate-deep hover:bg-teal/90"
              >
                {reviewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit Review"}
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                Review History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews
                </div>
              ) : reviews.isError ? (
                <p className="text-sm text-red-400">Review history could not be loaded.</p>
              ) : reviewHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No manager review saved yet.</p>
              ) : (
                reviewHistory.map((review: any) => (
                  <div key={review.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium">{review.reviewerName || `Manager #${review.reviewerId}`}</div>
                        <div className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`border-0 ${reviewClasses(review.status)}`}>
                          {formatLabel(review.status)}
                        </Badge>
                        {review.performanceSignal && (
                          <Badge variant="outline" className="border-0 bg-secondary/50 text-muted-foreground">
                            {formatLabel(review.performanceSignal)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
                      <div>
                        <div className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Score</div>
                        <div className="mt-1">
                          {review.overrideScore !== null && review.overrideScore !== undefined
                            ? `${review.originalScore ?? "--"} -> ${review.overrideScore}`
                            : `${review.originalScore ?? s.overallScore ?? "--"}`}
                        </div>
                        {review.overrideReason && (
                          <div className="mt-1 text-xs text-muted-foreground">Reason: {review.overrideReason}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-mono tracking-wider uppercase text-muted-foreground">Follow-up</div>
                        <div className="mt-1 text-muted-foreground">
                          {review.assignedNextDrill
                            ? `Drill: ${familyLabels[review.assignedNextDrill as keyof typeof familyLabels] || formatLabel(review.assignedNextDrill)}`
                            : review.followUpAction || "No follow-up action saved."}
                        </div>
                      </div>
                    </div>
                    {review.managerNotes && (
                      <div className="mt-3 rounded-md bg-secondary/30 p-2 text-sm text-muted-foreground">
                        {review.managerNotes}
                      </div>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
