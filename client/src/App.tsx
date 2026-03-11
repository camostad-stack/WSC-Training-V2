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
import { hasAuthConfig } from "@/const";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

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
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registerMutation = trpc.auth.register.useMutation();

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      if (mode === "sign_in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        await registerMutation.mutateAsync({
          name,
          email,
          password,
        });
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
      await utils.auth.me.invalidate();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setIsSubmitting(false);
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
            ? "Sign in with your Supabase-backed account."
            : "Supabase auth is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."}
        </p>
        {authConfigured ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={mode === "sign_in" ? "default" : "outline"}
                onClick={() => setMode("sign_in")}
                className={mode === "sign_in" ? "bg-teal text-slate-deep hover:bg-teal/90" : ""}
              >
                Sign In
              </Button>
              <Button
                type="button"
                variant={mode === "sign_up" ? "default" : "outline"}
                onClick={() => setMode("sign_up")}
                className={mode === "sign_up" ? "bg-teal text-slate-deep hover:bg-teal/90" : ""}
              >
                Sign Up
              </Button>
            </div>
            {mode === "sign_up" && (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                className="bg-card border-border"
              />
            )}
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="bg-card border-border"
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="bg-card border-border"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button onClick={() => void handleSubmit()} className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold" size="lg" disabled={isSubmitting || registerMutation.isPending || !email || !password || (mode === "sign_up" && !name)}>
              {isSubmitting ? "Working..." : mode === "sign_in" ? "Sign In" : "Create Account"}
            </Button>
          </div>
        ) : (
          <Button
            className="w-full bg-teal text-slate-deep hover:bg-teal/90 font-semibold"
            size="lg"
            disabled
          >
            Auth Not Configured
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
