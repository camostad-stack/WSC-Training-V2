import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, LogOut } from "lucide-react";
import { familyLabels } from "@/features/simulator/config";
import { Card, CardContent } from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  deriveLegacyLongitudinalProfileFallback,
  getLongitudinalCompetencyEntries,
  normalizeLongitudinalProfile,
} from "@shared/longitudinal-profile";

const readinessConfig: Record<string, { label: string; color: string }> = {
  not_ready: { label: "Not Ready", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  practice_more: { label: "Practice More", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  shadow_ready: { label: "Shadow Ready", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  partially_independent: { label: "Partially Independent", color: "text-teal bg-teal/10 border-teal/20" },
  independent: { label: "Independent", color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const trendIcons: Record<string, any> = {
  improving: TrendingUp,
  flat: Minus,
  declining: TrendingDown,
};

const skillLabels: Record<string, string> = {
  empathy: "Empathy",
  clarity: "Clarity",
  policy_accuracy: "Policy Accuracy",
  ownership: "Ownership",
  de_escalation: "De-Escalation",
  escalation_judgment: "Escalation Judgment",
  professional_presence: "Professional Presence",
};

export default function EmployeeProfile() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const profile = trpc.profile.me.useQuery(undefined, { retry: false });
  const recentSessions = trpc.sessions.myRecent.useQuery({ limit: 5 }, { retry: false });

  const p = profile.data;
  const readiness = p?.readinessStatus || "not_ready";
  const rCfg = readinessConfig[readiness] || readinessConfig.not_ready;
  const trend = p?.trend || "flat";
  const TrendIcon = trendIcons[trend] || Minus;
  const skillMap = (() => {
    try { return typeof p?.skillMap === "string" ? JSON.parse(p.skillMap) : (p?.skillMap || {}); }
    catch { return {}; }
  })() as Record<string, number>;
  const strongest = (() => {
    try { return typeof p?.strongestFamilies === "string" ? JSON.parse(p.strongestFamilies) : (p?.strongestFamilies || []); }
    catch { return []; }
  })() as string[];
  const weakest = (() => {
    try { return typeof p?.weakestFamilies === "string" ? JSON.parse(p.weakestFamilies) : (p?.weakestFamilies || []); }
    catch { return []; }
  })() as string[];
  const longitudinalProfile = (() => {
    if (!p?.longitudinalProfile) {
      return deriveLegacyLongitudinalProfileFallback({
        levelEstimate: p?.levelEstimate,
        totalSessions: p?.totalSessions,
        consistencyScore: p?.consistencyScore,
        skillMap,
      });
    }

    try {
      return normalizeLongitudinalProfile(
        typeof p.longitudinalProfile === "string" ? JSON.parse(p.longitudinalProfile) : p.longitudinalProfile,
      );
    } catch {
      return deriveLegacyLongitudinalProfileFallback({
        levelEstimate: p?.levelEstimate,
        totalSessions: p?.totalSessions,
        consistencyScore: p?.consistencyScore,
        skillMap,
      });
    }
  })();
  const longitudinalEntries = getLongitudinalCompetencyEntries(longitudinalProfile);

  if (profile.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
        <Card className="bg-card border-red-500/20">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-red-400">Your profile could not be loaded.</p>
            <Button variant="outline" className="w-full" onClick={() => profile.refetch()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
        <div className="flex items-center gap-4 pt-4">
          <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-xl">
            {(user?.name || "?")[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{user?.name || "Team Member"}</h1>
            <div className="text-sm text-muted-foreground">{user?.email}</div>
          </div>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">Your profile will appear after your first completed session. Finish one practice run to start tracking readiness, trend, and history.</p>
            <Button className="w-full bg-teal text-slate-deep hover:bg-teal/90" onClick={() => setLocation("/practice")}>
              Start Practice
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4 pt-4">
        <div className="w-14 h-14 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold text-xl">
          {(user?.name || "?")[0].toUpperCase()}
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold">{user?.name || "Team Member"}</h1>
          <div className="text-sm text-muted-foreground">{user?.email}</div>
        </div>
      </div>

      {/* Readiness + Practice Level */}
      <div className="panel p-4 flex items-center justify-between">
        <div>
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-1">Readiness</div>
          <Badge variant="outline" className={`${rCfg.color} text-xs`}>{rCfg.label}</Badge>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-1">Practice Level</div>
          <span className="font-mono text-lg font-bold text-teal">{p?.levelEstimate || "—"}</span>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-1">Trend</div>
          <div className="flex items-center gap-1">
            <TrendIcon className={`h-4 w-4 ${trend === "improving" ? "text-green-400" : trend === "declining" ? "text-red-400" : "text-muted-foreground"}`} />
            <span className="text-sm capitalize">{trend}</span>
          </div>
        </div>
      </div>

      {/* Manager Attention Flag */}
      {p?.managerAttentionFlag && (
        <div className="panel p-3 border-amber-500/30 bg-amber-500/5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
          <span className="text-sm text-amber">Manager review requested</span>
        </div>
      )}

      {/* Longitudinal Profile */}
      <div className="panel p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Longitudinal Growth Profile</div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              This tracks repeated development across sessions. It is separate from the one-call scorecard.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono border-border">
            {longitudinalProfile.stage_label}
          </Badge>
        </div>
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{longitudinalProfile.framework_name}</div>
              <div className="mt-1 text-xs text-muted-foreground leading-relaxed">{longitudinalProfile.stage_summary}</div>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono border-border">
              {longitudinalProfile.confidence}
            </Badge>
          </div>
        </div>
        <div className="space-y-3">
          {longitudinalEntries.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-start justify-between gap-3 text-xs mb-2">
                <div>
                  <div className="text-foreground font-medium">{entry.label}</div>
                  <div className="mt-1 text-muted-foreground leading-relaxed">{entry.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-foreground">{entry.score}/100</div>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase">{entry.trend}</div>
                </div>
              </div>
              <Progress value={entry.score} className="h-2 mb-2" />
              <div className="text-[11px] text-muted-foreground leading-relaxed">{entry.summary}</div>
              <div className="mt-2">
                <Badge variant="outline" className="text-[10px] font-mono border-border">
                  {entry.manager_confirmation_needed ? "Manager confirmation needed" : "Simulator observable"}
                </Badge>
              </div>
            </div>
          ))}
        </div>
        {longitudinalProfile.development_priorities.length > 0 && (
          <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Development Priorities</div>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {longitudinalProfile.development_priorities.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Practice Signals */}
      <div className="panel p-4">
        <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-3">Practice Signals</div>
        <div className="space-y-3">
          {Object.entries(skillLabels).map(([key, label]) => {
            const val = skillMap[key] || 0;
            return (
              <div key={key}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono text-foreground">{val}/10</span>
                </div>
                <Progress value={val * 10} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-3">
          <div className="text-[10px] font-mono text-green-400 tracking-wider uppercase mb-2">Strongest</div>
          {strongest.length > 0 ? strongest.map((s, i) => (
            <div key={i} className="text-xs text-muted-foreground mb-1">{familyLabels[s] || s}</div>
          )) : <div className="text-xs text-muted-foreground">No data yet</div>}
        </div>
        <div className="panel p-3">
          <div className="text-[10px] font-mono text-red-400 tracking-wider uppercase mb-2">Weakest</div>
          {weakest.length > 0 ? weakest.map((s, i) => (
            <div key={i} className="text-xs text-muted-foreground mb-1">{familyLabels[s] || s}</div>
          )) : <div className="text-xs text-muted-foreground">No data yet</div>}
        </div>
      </div>

      {/* Stats */}
      <div className="panel p-4">
        <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-3">Stats</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="font-mono text-xl font-bold text-teal">{p?.totalSessions || 0}</div>
            <div className="text-xs text-muted-foreground">Sessions</div>
          </div>
          <div>
            <div className="font-mono text-xl font-bold text-foreground">{p?.consistencyScore || 0}%</div>
            <div className="text-xs text-muted-foreground">Consistency</div>
          </div>
        </div>
      </div>

      <div className="panel p-4">
        <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-3">Recent History</div>
        {recentSessions.isError ? (
          <div className="space-y-3">
            <div className="text-sm text-red-400">Recent history could not be loaded.</div>
            <Button variant="outline" className="w-full" onClick={() => recentSessions.refetch()}>
              Retry History
            </Button>
          </div>
        ) : recentSessions.isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-teal" />
          </div>
        ) : recentSessions.data && recentSessions.data.length > 0 ? (
          <div className="space-y-2">
            {recentSessions.data.map((session: any) => (
              <div key={session.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{familyLabels[session.scenarioFamily || ""] || session.scenarioFamily || "Practice Session"}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(session.createdAt).toLocaleDateString()} · {session.mode?.replace("_", "-")}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold text-teal">{session.overallScore ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground uppercase">{session.passFail || "saved"}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No completed sessions yet.</div>
        )}
      </div>

      {/* Logout */}
      <Button
        onClick={() => logout()}
        variant="outline"
        className="w-full h-10 border-border text-muted-foreground gap-2"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );
}
