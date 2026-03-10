import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

function formatDetails(details: unknown) {
  if (!details) return "—";
  if (typeof details === "string") return details;

  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return "Unable to render details";
  }
}

export default function AdminAuditLog() {
  const audit = trpc.audit.recent.useQuery({ limit: 100 }, { retry: false });

  if (audit.isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-teal" />
      </div>
    );
  }

  if (audit.isError) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <p className="text-red-400 text-sm">Failed to load audit logs. Admin access is required.</p>
        </CardContent>
      </Card>
    );
  }

  const entries = audit.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {entries.length} recent administrative and review actions
        </p>
      </div>

      {entries.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No audit activity recorded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries.map((entry: any) => (
            <div key={entry.id} className="panel p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] border-0 bg-teal/10 text-teal">
                      {entry.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      User #{entry.userId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm">
                    {entry.targetType}
                    {entry.targetId ? ` #${entry.targetId}` : ""}
                  </div>
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words rounded-lg bg-secondary/30 p-3">
                    {formatDetails(entry.details)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
