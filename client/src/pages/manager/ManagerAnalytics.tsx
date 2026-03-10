import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, BarChart3, Users, Target, TrendingUp } from "lucide-react";

export default function ManagerAnalytics() {
  const stats = trpc.analytics.teamStats.useQuery(undefined, { retry: false });

  if (stats.isLoading) {
    return <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-teal" /></div>;
  }

  const d = stats.data;
  if (!d) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No analytics data available yet. Data will appear after team members complete training sessions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const avgScore = d.avgScore || 0;
  const passRate = d.passRate || 0;
  const completionRate = d.assignmentCompletionRate || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-1">Team performance overview</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-teal" />
              </div>
              <div>
                <div className="font-mono text-2xl font-bold">{d.totalSessions}</div>
                <div className="text-xs text-muted-foreground">Total Sessions</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Target className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <div className="font-mono text-2xl font-bold">{avgScore}</div>
                <div className="text-xs text-muted-foreground">Avg Score</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber" />
              </div>
              <div>
                <div className="font-mono text-2xl font-bold">{passRate}%</div>
                <div className="text-xs text-muted-foreground">Pass Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="font-mono text-2xl font-bold">{d.totalSessions > 0 ? "—" : "0"}</div>
                <div className="text-xs text-muted-foreground">Active Employees</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
              Performance Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Pass Rate</span>
                <span className="font-mono">{passRate}%</span>
              </div>
              <Progress value={passRate} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Average Score</span>
                <span className="font-mono">{avgScore}/100</span>
              </div>
              <Progress value={avgScore} className="h-2" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Assignment Completion</span>
                <span className="font-mono">{completionRate}%</span>
              </div>
              <Progress value={completionRate} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-mono tracking-wider uppercase text-muted-foreground">
              Session Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm">Pass</span>
              </div>
              <span className="font-mono text-sm">{Math.round(d.totalSessions * d.passRate / 100)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-sm">Borderline</span>
              </div>
              <span className="font-mono text-sm">{d.totalSessions - Math.round(d.totalSessions * d.passRate / 100)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm">Fail</span>
              </div>
              <span className="font-mono text-sm">—</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className="text-sm">Flagged</span>
              </div>
              <span className="font-mono text-sm">—</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
