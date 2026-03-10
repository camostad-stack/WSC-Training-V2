import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, Users, AlertTriangle, Clock, BarChart3, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { familyLabels } from "@/features/simulator/config";

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const team = trpc.team.myTeam.useQuery(undefined, { retry: false });

  const sessionsInput = useMemo(() => ({ limit: 20 }), []);
  const sessions = trpc.sessions.teamSessions.useQuery(sessionsInput, { retry: false });

  const teamData = team.data || [];
  const sessionsData = sessions.data?.sessions || [];

  const pendingReviews = sessionsData.filter((s: any) => s.reviewStatus === "pending");
  const flaggedSessions = sessionsData.filter((s: any) => s.isFlagged);

  const isLoading = team.isLoading || sessions.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user?.name?.split(" ")[0] || "Manager"}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-teal" />
        </div>
      ) : team.isError || sessions.isError ? (
        <Card className="bg-card border-red-500/20">
          <CardContent className="py-8 space-y-3">
            <p className="text-sm text-red-400">The manager dashboard could not load team or session data.</p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => team.refetch()}>Retry Team</Button>
              <Button variant="outline" onClick={() => sessions.refetch()}>Retry Sessions</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-teal" />
                  </div>
                  <div>
                    <div className="font-mono text-2xl font-bold">{teamData.length}</div>
                    <div className="text-xs text-muted-foreground">Team Members</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-amber" />
                  </div>
                  <div>
                    <div className="font-mono text-2xl font-bold">{pendingReviews.length}</div>
                    <div className="text-xs text-muted-foreground">Pending Reviews</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <div className="font-mono text-2xl font-bold">{flaggedSessions.length}</div>
                    <div className="text-xs text-muted-foreground">Flagged Sessions</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-green-400" />
                  </div>
                  <div>
                    <div className="font-mono text-2xl font-bold">{sessionsData.length}</div>
                    <div className="text-xs text-muted-foreground">Total Sessions</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Pending Reviews - Most important for manager */}
          {pendingReviews.length > 0 ? (
            <Card className="bg-card border-amber-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-amber flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Needs Your Review
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions")} className="text-teal text-xs gap-1">
                    View All <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {pendingReviews.slice(0, 5).map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setLocation(`/manage/sessions/${s.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        s.passFail === "pass" ? "bg-green-500" :
                        s.passFail === "fail" ? "bg-red-500" :
                        "bg-amber-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {s.employeeName || "Unknown"} — {familyLabels[s.scenarioFamily || ""] || (s.scenarioFamily || "session").replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()} · Score: {s.overallScore ?? "—"}
                        </div>
                      </div>
                      {s.isFlagged && <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />}
                      <Badge variant="outline" className={`text-[10px] border-0 ${
                        s.passFail === "pass" ? "text-green-400 bg-green-500/10" :
                        s.passFail === "fail" ? "text-red-400 bg-red-500/10" :
                        "text-amber-400 bg-amber-500/10"
                      }`}>
                        {s.passFail || "pending"}
                      </Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
                  Pending Reviews
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">No sessions are waiting for review right now.</p>
                <Button variant="outline" onClick={() => setLocation("/manage/sessions")}>
                  Open Session Queue
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Recent Sessions */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground flex items-center justify-between">
                Recent Sessions
                <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions")} className="text-teal text-xs gap-1">
                  View All <ArrowRight className="h-3 w-3" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sessionsData.length > 0 ? (
                <div className="space-y-2">
                  {sessionsData.slice(0, 5).map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setLocation(`/manage/sessions/${s.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors text-left"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        s.isFlagged ? "bg-red-500" :
                        s.passFail === "pass" ? "bg-green-500" :
                        s.passFail === "fail" ? "bg-red-500" :
                        "bg-amber-500"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {s.employeeName || "Unknown"} — {familyLabels[s.scenarioFamily || ""] || (s.scenarioFamily || "session").replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()} · Score: {s.overallScore ?? "—"}
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[9px] border-0 ${
                        s.reviewStatus === "reviewed" ? "text-teal bg-teal/10" :
                        s.reviewStatus === "overridden" ? "text-amber bg-amber/10" :
                        "text-muted-foreground bg-muted/10"
                      }`}>
                        {s.reviewStatus === "pending" ? "New" : s.reviewStatus}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No team sessions recorded yet. Sessions will appear here after employees complete training.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
