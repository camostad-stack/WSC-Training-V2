import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import {
  Play,
  Target,
  TrendingUp,
  ClipboardList,
  ChevronRight,
  Shield,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { familyLabels } from "@/features/simulator/config";
import { usePracticeLaunch } from "@/features/simulator/usePracticeLaunch";

const readinessConfig: Record<string, { label: string; color: string; bg: string }> = {
  not_ready: { label: "Not Ready", color: "text-red-400", bg: "bg-red-500/10" },
  practice_more: { label: "Practice More", color: "text-amber-400", bg: "bg-amber-500/10" },
  shadow_ready: { label: "Shadow Ready", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  partially_independent: { label: "Partially Independent", color: "text-teal", bg: "bg-teal/10" },
  independent: { label: "Independent", color: "text-green-400", bg: "bg-green-500/10" },
};

const trendIcons: Record<string, string> = {
  improving: "↑",
  flat: "→",
  declining: "↓",
};

export default function EmployeeHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { isStarting, startPractice } = usePracticeLaunch();
  const profile = trpc.profile.me.useQuery(undefined, { retry: false });
  const recentSessions = trpc.sessions.myRecent.useQuery({ limit: 3 }, { retry: false });
  const assignments = trpc.assignments.myAssignments.useQuery(undefined, { retry: false });

  const firstName = user?.name?.split(" ")[0] || "Team Member";
  const readiness = profile.data?.readinessStatus || "not_ready";
  const rCfg = readinessConfig[readiness] || readinessConfig.not_ready;
  const trend = profile.data?.trend || "flat";
  const levelEstimate = profile.data?.levelEstimate || "—";
  const focusArea = familyLabels[profile.data?.weakestFamilies?.[0] || ""] || profile.data?.weakestFamilies?.[0] || "General Practice";
  const pendingAssignments = (assignments.data as any[])?.filter((a: any) => a.status === "assigned" || a.status === "in_progress") || [];
  const lastScore = (recentSessions.data as any[])?.[0]?.overallScore;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      {/* Greeting + Readiness */}
      <div className="pt-2">
        <h1 className="text-xl font-semibold">Hey, {firstName}</h1>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={`${rCfg.bg} ${rCfg.color} border-0 font-mono text-[10px] tracking-wider uppercase`}>
            <Shield className="h-3 w-3 mr-1" />
            {rCfg.label}
          </Badge>
          {profile.data?.managerAttentionFlag && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-0 text-[10px]">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Review Pending
            </Badge>
          )}
        </div>
      </div>

      {profile.isError && (
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-4 text-sm text-red-400">
            Your profile is unavailable right now. You can still start practice, but readiness and trend details may be out of date.
          </CardContent>
        </Card>
      )}

      {/* Start Practice CTA */}
      <Button
        onClick={() => startPractice({
          assignmentId: undefined,
          assignmentTitle: undefined,
          scenarioTemplateId: undefined,
          scenarioFamily: undefined,
          difficultyMin: 1,
          difficultyMax: 5,
        })}
        disabled={isStarting}
        className="w-full h-14 bg-teal text-slate-deep hover:bg-teal/90 font-semibold text-base gap-3 rounded-xl"
        size="lg"
      >
        {isStarting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
        {isStarting ? "Generating Scenario..." : "Start Practice"}
      </Button>
      <button
        onClick={() => setLocation("/practice")}
        className="w-full text-sm text-muted-foreground hover:text-foreground"
      >
        Adjust practice options
      </button>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-mono font-bold text-teal">{lastScore ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Last Score</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-mono font-bold text-foreground">{levelEstimate}</div>
            <div className="text-[10px] text-muted-foreground mt-1">Level</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-mono font-bold">
              <span className={trend === "improving" ? "text-green-400" : trend === "declining" ? "text-red-400" : "text-muted-foreground"}>
                {trendIcons[trend] || "→"}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">Trend</div>
          </CardContent>
        </Card>
      </div>

      {/* Current Focus Area */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
            <Target className="h-5 w-5 text-amber" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase">Focus Area</div>
            <div className="text-sm font-medium truncate">{focusArea}</div>
          </div>
        </CardContent>
      </Card>

      {/* Assigned Drills */}
      {assignments.isError ? (
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-red-400">Assigned drills could not be loaded.</p>
            <Button variant="outline" className="w-full" onClick={() => assignments.refetch()}>
              Retry Assignments
            </Button>
          </CardContent>
        </Card>
      ) : pendingAssignments.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-teal" />
              Assigned Drills
            </h2>
            <button
              onClick={() => setLocation("/assignments")}
              className="text-xs text-teal hover:text-teal/80 flex items-center gap-1"
            >
              View All <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="space-y-2">
            {pendingAssignments.slice(0, 2).map((a: any) => (
              <Card key={a.id} className="bg-card border-border">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{a.title || familyLabels[a.scenarioFamily] || "General"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Difficulty {a.difficultyMin}–{a.difficultyMax} · {a.requiredAttempts} attempt{a.requiredAttempts > 1 ? "s" : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-amber/30 text-amber shrink-0">
                    {a.status === "in_progress" ? "In Progress" : "Assigned"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase mb-2">Assignments</div>
            <p className="text-sm text-muted-foreground">No manager drills are assigned right now. Use practice to keep your history and profile moving.</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Sessions */}
      {recentSessions.isError ? (
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-red-400">Recent sessions could not be loaded.</p>
            <Button variant="outline" className="w-full" onClick={() => recentSessions.refetch()}>
              Retry History
            </Button>
          </CardContent>
        </Card>
      ) : (recentSessions.data as any[])?.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-teal" />
            Recent Sessions
          </h2>
          <div className="space-y-2">
            {(recentSessions.data as any[]).map((s: any) => (
              <Card key={s.id} className="bg-card border-border">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{familyLabels[s.scenarioFamily || ""] || s.scenarioFamily || "Scenario"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()} · {s.mode?.replace("_", "-")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.overallScore != null && (
                      <span className={`font-mono text-sm font-bold ${
                        s.overallScore >= 80 ? "text-green-400" : s.overallScore >= 60 ? "text-amber-400" : "text-red-400"
                      }`}>
                        {s.overallScore}
                      </span>
                    )}
                    <Badge variant="outline" className={`text-[10px] ${
                      s.passFail === "pass" ? "text-green-400 border-green-400/30" :
                      s.passFail === "borderline" ? "text-amber-400 border-amber-400/30" :
                      "text-red-400 border-red-400/30"
                    }`}>
                      {s.passFail || "—"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase mb-2">Recent Sessions</div>
            <p className="text-sm text-muted-foreground">No completed sessions yet. Finish one practice run and it will appear here automatically.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading states */}
      {profile.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
