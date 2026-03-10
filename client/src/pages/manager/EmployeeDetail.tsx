import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, User, TrendingUp, AlertTriangle, ChevronRight } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { familyLabels } from "@/features/simulator/config";

export default function EmployeeDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const employeeId = parseInt(params.id || "0");

  const profile = trpc.profile.getByUserId.useQuery({ userId: employeeId }, { retry: false, enabled: employeeId > 0 });
  const sessions = trpc.sessions.teamSessions.useQuery(
    { employeeId, limit: 20 },
    { retry: false, enabled: employeeId > 0 },
  );

  if (profile.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  if (profile.isError || sessions.isError) {
    return (
      <Card className="bg-card border-red-500/20">
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-red-400 text-sm">Employee detail could not be loaded.</p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" onClick={() => profile.refetch()}>Retry Profile</Button>
            <Button variant="outline" onClick={() => sessions.refetch()}>Retry Sessions</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const p = profile.data;
  const recentSessions = sessions.data?.sessions || [];

  const skillMap = (() => {
    try { return typeof p?.skillMap === "string" ? JSON.parse(p.skillMap) : (p?.skillMap || {}); }
    catch { return {}; }
  })() as Record<string, number>;

  const readinessColor = (status: string) => {
    switch (status) {
      case "independent": return "text-green-400 bg-green-500/10";
      case "partially_independent": return "text-teal bg-teal/10";
      case "shadow_ready": return "text-amber-400 bg-amber-500/10";
      default: return "text-red-400 bg-red-500/10";
    }
  };

  const trendIcon = (trend: string) => {
    if (trend === "improving") return "text-green-400";
    if (trend === "declining") return "text-red-400";
    return "text-muted-foreground";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/team")} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Team
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Employee #{employeeId}</h1>
        </div>
      </div>

      {!p ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No profile data available for this employee yet. Profile will be created after their first training session.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Level</div>
                <div className="font-mono text-2xl font-bold text-teal">{p.levelEstimate || "—"}</div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Readiness</div>
                <Badge variant="outline" className={`border-0 ${readinessColor(p.readinessStatus || "not_ready")}`}>
                  {(p.readinessStatus || "not_ready").replace(/_/g, " ")}
                </Badge>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Trend</div>
                <div className={`text-sm font-medium capitalize flex items-center gap-1 ${trendIcon(p.trend || "flat")}`}>
                  <TrendingUp className="h-4 w-4" />
                  {p.trend || "flat"}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="text-xs text-muted-foreground mb-1">Consistency</div>
                <div className="font-mono text-2xl font-bold">{p.consistencyScore || 0}%</div>
              </CardContent>
            </Card>
          </div>

          {/* Manager Attention Flag */}
          {p.managerAttentionFlag && (
            <Card className="bg-red-500/5 border-red-500/20">
              <CardContent className="py-3 flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-red-400">Manager Attention Required</div>
                  <div className="text-xs text-muted-foreground">This employee has been flagged for additional support or review.</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Skill Map */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Skill Map</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(skillMap).length === 0 ? (
                <p className="text-sm text-muted-foreground">No skill data yet</p>
              ) : (
                Object.entries(skillMap).map(([skill, score]) => (
                  <div key={skill}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground capitalize">{skill.replace(/_/g, " ")}</span>
                      <span className="font-mono">{score}/10</span>
                    </div>
                    <Progress value={(score as number) * 10} className="h-1.5" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Scenario Strengths/Weaknesses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Strongest Scenarios</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  try {
                    const families = typeof p.strongestFamilies === "string" ? JSON.parse(p.strongestFamilies) : (p.strongestFamilies || []);
                    return families.length > 0 ? (
                      <ul className="space-y-1">
                        {families.map((f: string, i: number) => (
                          <li key={i} className="text-sm text-green-400">{familyLabels[f] || f.replace(/_/g, " ")}</li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-muted-foreground">No data yet</p>;
                  } catch { return <p className="text-sm text-muted-foreground">No data yet</p>; }
                })()}
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Weakest Scenarios</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  try {
                    const families = typeof p.weakestFamilies === "string" ? JSON.parse(p.weakestFamilies) : (p.weakestFamilies || []);
                    return families.length > 0 ? (
                      <ul className="space-y-1">
                        {families.map((f: string, i: number) => (
                          <li key={i} className="text-sm text-red-400">{familyLabels[f] || f.replace(/_/g, " ")}</li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-muted-foreground">No data yet</p>;
                  } catch { return <p className="text-sm text-muted-foreground">No data yet</p>; }
                })()}
              </CardContent>
            </Card>
          </div>

          {/* Recent Sessions */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">Recent Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {recentSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions found for this employee</p>
              ) : (
                <div className="space-y-1">
                  {recentSessions.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setLocation(`/manage/sessions/${s.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className={`w-2 h-6 rounded-full ${
                        s.passFail === "pass" ? "bg-green-500" :
                        s.passFail === "fail" ? "bg-red-500" : "bg-amber-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{familyLabels[s.scenarioFamily || ""] || (s.scenarioFamily || "").replace(/_/g, " ")}</span>
                        <span className="text-xs text-muted-foreground ml-2">{new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="font-mono text-sm">{s.overallScore || "—"}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
