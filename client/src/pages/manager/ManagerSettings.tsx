import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Shield, Bell, Database } from "lucide-react";

export default function ManagerSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration and preferences</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings className="h-4 w-4 text-teal" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Simulation defaults, scoring thresholds, and session configuration. These settings apply to all new training sessions.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm">Default difficulty</span>
                <span className="font-mono text-sm text-teal">3</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm">Max turns per session</span>
                <span className="font-mono text-sm text-teal">5</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm">Pass threshold</span>
                <span className="font-mono text-sm text-teal">70</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">Low-effort detection</span>
                <span className="font-mono text-sm text-green-400">Enabled</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber" />
              Roles & Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Role-based access is enforced server-side. Employees can only access their own records. Managers access their assigned team.
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm">Employee</span>
                <span className="text-xs text-muted-foreground">Practice, view own results</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-border/50">
                <span className="text-sm">Manager</span>
                <span className="text-xs text-muted-foreground">Team oversight, assignments, reviews</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm">Admin</span>
                <span className="text-xs text-muted-foreground">Full system access</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bell className="h-4 w-4 text-teal" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Configure alerts for flagged sessions, overdue assignments, and manager attention flags.
            </p>
            <div className="mt-4 py-6 text-center text-xs text-muted-foreground">
              Notification settings coming in a future update.
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4 text-amber" />
              Data & Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Export training data, session transcripts, and analytics reports.
            </p>
            <div className="mt-4 py-6 text-center text-xs text-muted-foreground">
              Data export coming in a future update.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
