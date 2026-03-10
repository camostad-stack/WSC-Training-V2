import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SimulatorProvider } from "./contexts/SimulatorContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { useState } from "react";

// ─── Employee Pages (mobile-first) ───
const EmployeeHome = lazy(() => import("./pages/employee/EmployeeHome"));
const PracticeSetup = lazy(() => import("./pages/employee/PracticeSetup"));
const ScenarioIntro = lazy(() => import("./pages/employee/ScenarioIntro"));
const PracticeSession = lazy(() => import("./pages/employee/PracticeSession"));
const LiveVoiceSession = lazy(() => import("./pages/employee/LiveVoiceSession"));
const SessionResults = lazy(() => import("./pages/employee/SessionResults"));
const EmployeeAssignments = lazy(() => import("./pages/employee/EmployeeAssignments"));
const EmployeeProfile = lazy(() => import("./pages/employee/EmployeeProfile"));

// ─── Manager Pages (desktop-first) ───
const ManagerDashboard = lazy(() => import("./pages/manager/ManagerDashboard"));
const ManagerTeam = lazy(() => import("./pages/manager/ManagerTeam"));
const ManagerSessions = lazy(() => import("./pages/manager/ManagerSessions"));
const ManagerAssignments = lazy(() => import("./pages/manager/ManagerAssignments"));
const SessionDetail = lazy(() => import("./pages/manager/SessionDetail"));
const EmployeeDetail = lazy(() => import("./pages/manager/EmployeeDetail"));

// ─── Admin Pages ───
const AdminUsers = lazy(() => import("./pages/manager/AdminUsers"));
const ManagerScenarios = lazy(() => import("./pages/manager/ManagerScenarios"));
const ManagerPolicies = lazy(() => import("./pages/manager/ManagerPolicies"));
const AdminAuditLog = lazy(() => import("./pages/manager/AdminAuditLog"));

// ─── Layouts ───
import EmployeeLayout from "./components/EmployeeLayout";
import ManagerLayout from "./components/ManagerLayout";

// ─── Auth Gate ───
import { getLoginUrl, hasAuthConfig } from "@/const";
import { Button } from "@/components/ui/button";

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
        <span className="text-sm text-muted-foreground font-mono tracking-wider">LOADING</span>
      </div>
    </div>
  );
}

function LoginScreen() {
  const authConfigured = hasAuthConfig();
  const loginUrl = getLoginUrl();
  const [localRole, setLocalRole] = useState<"employee" | "manager" | "admin">("employee");
  const [isStartingLocal, setIsStartingLocal] = useState(false);

  const startLocalSession = async () => {
    setIsStartingLocal(true);
    try {
      const response = await fetch("/api/local-auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          role: localRole,
          department: localRole === "employee" ? "customer_service" : "customer_service",
        }),
      });

      if (!response.ok) {
        throw new Error("Local auth failed");
      }

      window.location.reload();
    } catch (error) {
      console.error(error);
    } finally {
      setIsStartingLocal(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="panel p-8 max-w-sm w-full text-center space-y-6">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center">
            <span className="text-teal font-bold text-lg font-mono">W</span>
          </div>
        </div>
        <h1 className="text-xl font-semibold">WSC Training Simulator</h1>
        <p className="text-sm text-muted-foreground">
          {authConfigured
            ? "Sign in to access your training dashboard."
            : "Choose a demo role to continue. External auth can be added later without changing the app flow."}
        </p>
        {!authConfigured && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "employee", label: "Employee" },
                { value: "manager", label: "Manager" },
                { value: "admin", label: "Admin" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setLocalRole(option.value as "employee" | "manager" | "admin")}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    localRole === option.value
                      ? "border-teal/40 bg-teal/10 text-teal"
                      : "border-border bg-secondary/30 text-muted-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              onClick={() => void startLocalSession()}
              className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold"
              size="lg"
              disabled={isStartingLocal}
            >
              {isStartingLocal ? "Starting Local Session..." : `Continue as ${localRole.charAt(0).toUpperCase()}${localRole.slice(1)}`}
            </Button>
          </div>
        )}
        {authConfigured && (
          <Button
            onClick={() => {
              if (loginUrl) {
                window.location.href = loginUrl;
              }
            }}
            className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold"
            size="lg"
            disabled={!loginUrl}
          >
            Sign In
          </Button>
        )}
      </div>
    </div>
  );
}

function EmployeeRouter() {
  return (
    <EmployeeLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/" component={EmployeeHome} />
          <Route path="/practice" component={PracticeSetup} />
          <Route path="/practice/intro" component={ScenarioIntro} />
          <Route path="/practice/session" component={PracticeSession} />
          <Route path="/practice/live" component={LiveVoiceSession} />
          <Route path="/practice/results" component={SessionResults} />
          <Route path="/assignments" component={EmployeeAssignments} />
          <Route path="/profile" component={EmployeeProfile} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </EmployeeLayout>
  );
}

function ManagerRouter() {
  return (
    <ManagerLayout>
      <Suspense fallback={<LoadingScreen />}>
        <Switch>
          {/* Manager core pages */}
          <Route path="/manage" component={ManagerDashboard} />
          <Route path="/manage/team" component={ManagerTeam} />
          <Route path="/manage/team/:id" component={EmployeeDetail} />
          <Route path="/manage/sessions" component={ManagerSessions} />
          <Route path="/manage/sessions/:id" component={SessionDetail} />
          <Route path="/manage/assignments" component={ManagerAssignments} />
          {/* Admin pages */}
          <Route path="/manage/users" component={AdminUsers} />
          <Route path="/manage/scenarios" component={ManagerScenarios} />
          <Route path="/manage/policies" component={ManagerPolicies} />
          <Route path="/manage/audit" component={AdminAuditLog} />
          {/* Manager can also access employee pages */}
          <Route path="/" component={EmployeeHome} />
          <Route path="/practice" component={PracticeSetup} />
          <Route path="/practice/intro" component={ScenarioIntro} />
          <Route path="/practice/session" component={PracticeSession} />
          <Route path="/practice/live" component={LiveVoiceSession} />
          <Route path="/practice/results" component={SessionResults} />
          <Route path="/assignments" component={EmployeeAssignments} />
          <Route path="/profile" component={EmployeeProfile} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </ManagerLayout>
  );
}

function AppRouter() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen />;

  const isManager = ["manager", "admin", "super_admin"].includes(user.role);

  if (isManager) {
    return <ManagerRouter />;
  }

  return <EmployeeRouter />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <SimulatorProvider>
            <Toaster
              theme="dark"
              toastOptions={{
                style: {
                  background: 'oklch(0.17 0.015 260)',
                  border: '1px solid oklch(0.25 0.015 260)',
                  color: 'oklch(0.93 0.005 260)',
                },
              }}
            />
            <AppRouter />
          </SimulatorProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
