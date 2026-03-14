import { useSimulator } from "@/contexts/SimulatorContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, Redirect } from "wouter";
import { Play, User, Phone, Users, Mic } from "lucide-react";
import { familyLabels } from "@/features/simulator/config";

export default function ScenarioIntro() {
  const [, setLocation] = useLocation();
  const { scenario, config } = useSimulator();

  if (!scenario) return <Redirect to="/practice" />;

  const persona = scenario.customer_persona;
  const startLabel = config.mode === "live-voice"
    ? "Answer Call"
    : config.mode === "phone"
      ? "Start Phone Call"
      : "Start Conversation";

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto flex flex-col">
      <div className="flex-1 space-y-5 pt-4">
        <div className="text-center">
          <Badge variant="outline" className="bg-amber-500/10 text-amber border-0 font-mono text-[10px] tracking-wider uppercase mb-3">
            Incoming Call
          </Badge>
          <h1 className="text-xl font-semibold">{persona.name || "Caller"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {familyLabels[scenario.issue_type || scenario.scenario_family || ""] || scenario.issue_type || scenario.scenario_family || "Customer interaction"}
            {" · "}
            {config.mode === "phone" ? "Phone Call" : config.mode === "live-voice" ? "Live Call" : "In-Person"}
          </p>
          {config.assignmentTitle && (
            <p className="text-xs text-teal mt-2">{config.assignmentTitle}</p>
          )}
        </div>

        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center">
              <User className="h-5 w-5 text-teal" />
            </div>
            <div>
              <div className="font-medium text-sm">{persona.name}</div>
              <div className="text-xs text-muted-foreground">
                {persona.membership_status || persona.membership_context || "Member"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {config.mode === "phone" ? (
              <Badge variant="outline" className="text-[10px] border-border"><Phone className="h-3 w-3 mr-1" /> Phone</Badge>
            ) : config.mode === "live-voice" ? (
              <Badge variant="outline" className="text-[10px] border-border"><Mic className="h-3 w-3 mr-1" /> Live Voice</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-border"><Users className="h-3 w-3 mr-1" /> In-Person</Badge>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase mb-2">What You Know</div>
          <p className="text-sm leading-relaxed">{scenario.situation_summary}</p>
        </div>

        <div className="panel p-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase mb-2">How It Starts</div>
          <p className="text-sm leading-relaxed">The caller opens with: “{scenario.opening_line}”</p>
        </div>
      </div>

      <div className="pt-4 pb-2">
        <Button
          onClick={() => setLocation(config.mode === "live-voice" ? "/practice/live" : "/practice/session")}
          className="w-full h-14 bg-teal text-slate-deep hover:bg-teal/90 font-semibold text-base gap-3 rounded-xl"
          size="lg"
        >
          <Play className="h-5 w-5" />
          {startLabel}
        </Button>
      </div>
    </div>
  );
}
