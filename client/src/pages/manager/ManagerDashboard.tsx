import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Loader2,
  Users,
  AlertTriangle,
  Clock,
  BarChart3,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useMemo } from "react";
import { familyLabels } from "@/features/simulator/config";

function DashboardNavCard(props: {
  icon: typeof Users;
  iconClassName: string;
  title: string;
  value: number;
  detail: string;
  onClick: () => void;
}) {
  const Icon = props.icon;

  return (
    <button
      onClick={props.onClick}
      className="w-full text-left rounded-xl border border-border bg-card transition-colors hover:border-teal/40 hover:bg-secondary/20"
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${props.iconClassName}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-2xl font-bold">{props.value}</div>
            <div className="text-xs text-muted-foreground">{props.title}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{props.detail}</div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </div>
      </CardContent>
    </button>
  );
}

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <DashboardNavCard
              icon={Users}
              iconClassName="bg-teal/10 text-teal"
              title="Team Members"
              value={teamData.length}
              detail="Open the team roster"
              onClick={() => setLocation("/manage/team")}
            />

            <DashboardNavCard
              icon={Clock}
              iconClassName="bg-amber-500/10 text-amber"
              title="Pending Reviews"
              value={pendingReviews.length}
              detail="Open the review queue"
              onClick={() => setLocation("/manage/sessions?filter=pending")}
            />

            <DashboardNavCard
              icon={AlertTriangle}
              iconClassName="bg-red-500/10 text-red-400"
              title="Flagged Sessions"
              value={flaggedSessions.length}
              detail="Open flagged sessions"
              onClick={() => setLocation("/manage/sessions?filter=flagged")}
            />

            <DashboardNavCard
              icon={BarChart3}
              iconClassName="bg-green-500/10 text-green-400"
              title="Total Sessions"
              value={sessionsData.length}
              detail="Open all session history"
              onClick={() => setLocation("/manage/sessions?filter=all")}
            />
          </div>

          {pendingReviews.length > 0 ? (
            <Card className="bg-card border-amber-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-amber flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" /> Needs Your Review
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions?filter=pending")} className="text-teal text-xs gap-1">
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
                <Button variant="outline" onClick={() => setLocation("/manage/sessions?filter=pending")}>
                  Open Session Queue
                </Button>
              </CardContent>
            </Card>
          )}

          {flaggedSessions.length > 0 && (
            <Card className="bg-card border-red-500/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-mono tracking-wider uppercase text-red-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Flagged Sessions
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions?filter=flagged")} className="text-teal text-xs gap-1">
                    Open Queue <ArrowRight className="h-3 w-3" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {flaggedSessions.slice(0, 3).map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setLocation(`/manage/sessions/${s.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors text-left"
                    >
                      <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate">
                          {s.employeeName || "Unknown"} — {familyLabels[s.scenarioFamily || ""] || (s.scenarioFamily || "session").replace(/_/g, " ")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.createdAt).toLocaleDateString()} · Score: {s.overallScore ?? "—"}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground flex items-center justify-between">
                Recent Sessions
                <Button variant="ghost" size="sm" onClick={() => setLocation("/manage/sessions?filter=all")} className="text-teal text-xs gap-1">
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
