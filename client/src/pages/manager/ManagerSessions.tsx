import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";
import { Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { familyLabels } from "@/features/simulator/config";

const reviewFilters = [
  { value: "all", label: "All Sessions" },
  { value: "pending", label: "Needs Review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "overridden", label: "Overridden" },
  { value: "flagged", label: "Flagged" },
] as const;

export default function ManagerSessions() {
  const [, setLocation] = useLocation();
  const [reviewFilter, setReviewFilter] = useState<(typeof reviewFilters)[number]["value"]>("pending");

  const queryInput = useMemo(() => ({
    limit: 50,
    ...(reviewFilter !== "all" ? { reviewStatus: reviewFilter } : {}),
  }), [reviewFilter]);

  const sessions = trpc.sessions.teamSessions.useQuery(queryInput, { retry: false });

  if (sessions.isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (sessions.isError) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-red-400 text-sm">Failed to load sessions. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  const data = sessions.data?.sessions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sessions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {reviewFilter === "pending"
              ? `${data.length} session${data.length !== 1 ? "s" : ""} currently need review`
              : `${data.length} session${data.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={reviewFilter} onValueChange={(value) => setReviewFilter(value as (typeof reviewFilters)[number]["value"])}>
            <SelectTrigger className="w-48 bg-card border-border">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {reviewFilters.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {data.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {reviewFilter !== "all"
                ? `No ${reviewFilter} sessions found.`
                : "No team sessions yet. Sessions will appear here after employees complete training."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs font-mono text-muted-foreground tracking-wider uppercase">
            <div className="col-span-3">Employee</div>
            <div className="col-span-2">Scenario</div>
            <div className="col-span-1">Score</div>
            <div className="col-span-2">Result</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-1">Review</div>
            <div className="col-span-1"></div>
          </div>

          {data.map((s: any) => (
            <button
              key={s.id}
              onClick={() => setLocation(`/manage/sessions/${s.id}`)}
              className="w-full grid grid-cols-12 gap-3 px-4 py-3 panel items-center hover:border-teal/30 transition-colors text-left"
            >
              <div className="col-span-3 text-sm truncate">{s.employeeName || "Unknown"}</div>
              <div className="col-span-2 text-xs text-muted-foreground truncate capitalize">
                {familyLabels[s.scenarioFamily || ""] || (s.scenarioFamily || "—").replace(/_/g, " ")}
              </div>
              <div className="col-span-1 font-mono text-sm font-bold">
                {s.overallScore ?? "—"}
              </div>
              <div className="col-span-2">
                <Badge variant="outline" className={`text-[10px] border-0 ${
                  s.passFail === "pass" ? "text-green-400 bg-green-500/10" :
                  s.passFail === "fail" ? "text-red-400 bg-red-500/10" :
                  "text-amber-400 bg-amber-500/10"
                }`}>
                  {s.passFail || "pending"}
                </Badge>
              </div>
              <div className="col-span-2 text-xs text-muted-foreground">
                {new Date(s.createdAt).toLocaleDateString()}
              </div>
              <div className="col-span-1 flex items-center gap-1">
                {s.isFlagged && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
                <Badge variant="outline" className={`text-[9px] border-0 ${
                  s.reviewStatus === "reviewed" ? "text-teal bg-teal/10" :
                  s.reviewStatus === "overridden" ? "text-amber bg-amber/10" :
                  s.reviewStatus === "flagged" ? "text-red-400 bg-red-500/10" :
                  "text-muted-foreground bg-muted/10"
                }`}>
                  {s.reviewStatus === "pending" ? "New" : s.reviewStatus}
                </Badge>
              </div>
              <div className="col-span-1 flex justify-end">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
