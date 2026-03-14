import VoiceTurnRecorder from "@/components/VoiceTurnRecorder";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function VoiceAnalyzerTest() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Internal Voice Analyzer Diagnostics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Voice delivery analysis is now integrated into the employee live simulation flow. This page is only for
          isolated diagnostics against the local analyzer service running on
          {" "}
          <span className="font-mono text-foreground">http://localhost:3010</span>.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            className="bg-teal text-slate-deep hover:bg-teal/90"
            onClick={() => setLocation("/practice/intro")}
          >
            Open Employee Practice Flow
          </Button>
        </div>
      </div>

      <VoiceTurnRecorder
        analyzerUrl="http://localhost:3010"
        sessionId={`voice_test_${Date.now()}`}
        employeeId={user?.id ? `user_${user.id}` : "employee_demo_001"}
      />
    </div>
  );
}
