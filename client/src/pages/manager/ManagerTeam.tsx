import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronRight } from "lucide-react";

const readinessConfig: Record<string, { label: string; color: string }> = {
  not_ready: { label: "Not Ready", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  practice_more: { label: "Practice More", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  shadow_ready: { label: "Shadow Ready", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  partially_independent: { label: "Partial", color: "text-teal bg-teal/10 border-teal/20" },
  independent: { label: "Independent", color: "text-green-400 bg-green-500/10 border-green-500/20" },
};

const trendIcons: Record<string, any> = {
  improving: TrendingUp,
  flat: Minus,
  declining: TrendingDown,
};

export default function ManagerTeam() {
  const [, setLocation] = useLocation();
  const team = trpc.team.myTeam.useQuery(undefined, { retry: false });

  if (team.isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (team.isError) {
    return (
      <Card className="bg-card border-red-500/20">
        <CardContent className="py-12 text-center space-y-3">
          <p className="text-red-400 text-sm">Team data could not be loaded.</p>
          <Button variant="outline" onClick={() => team.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const members = team.data || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">{members.length} team member{members.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {members.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No team members found. Employees will appear here after they sign in.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {members.map((m: any) => {
            const profile = m.profile;
            const readiness = profile?.readinessStatus || "not_ready";
            const rCfg = readinessConfig[readiness] || readinessConfig.not_ready;
            const trend = profile?.trend || "flat";
            const TrendIcon = trendIcons[trend] || Minus;

            return (
              <button
                key={m.id}
                onClick={() => setLocation(`/manage/team/${m.id}`)}
                className="w-full panel p-4 flex items-center gap-4 hover:border-teal/30 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center text-teal font-bold shrink-0">
                  {(m.name || "?")[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{m.name || "Unknown"}</span>
                    {profile?.managerAttentionFlag && (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Level {profile?.levelEstimate || "—"} · {profile?.totalSessions || 0} sessions
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="outline" className={`${rCfg.color} text-[10px] border-0`}>
                    {rCfg.label}
                  </Badge>
                  <TrendIcon className={`h-4 w-4 ${trend === "improving" ? "text-green-400" : trend === "declining" ? "text-red-400" : "text-muted-foreground"}`} />
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
