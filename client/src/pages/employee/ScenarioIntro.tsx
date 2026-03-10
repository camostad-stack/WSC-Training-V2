import { useSimulator } from "@/contexts/SimulatorContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation, Redirect } from "wouter";
import { Play, AlertTriangle, User, Phone, Users, Mic } from "lucide-react";
import { familyLabels } from "@/features/simulator/config";

export default function ScenarioIntro() {
  const [, setLocation] = useLocation();
  const { scenario, config } = useSimulator();

  if (!scenario) return <Redirect to="/practice" />;

  const persona = scenario.customer_persona;

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto flex flex-col">
      <div className="flex-1 space-y-5 pt-4">
        {/* Header */}
        <div className="text-center">
          <Badge variant="outline" className="bg-amber-500/10 text-amber border-0 font-mono text-[10px] tracking-wider uppercase mb-3">
            Step 1 of 3
          </Badge>
          <h1 className="text-xl font-semibold">{familyLabels[scenario.issue_type || scenario.scenario_family || ""] || scenario.issue_type || scenario.scenario_family || "Customer Interaction"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Difficulty {scenario.difficulty} · {config.mode === "phone" ? "Phone Call" : config.mode === "live-voice" ? "Live Voice Call" : "In-Person"}
          </p>
          {config.assignmentTitle && (
            <p className="text-xs text-teal mt-2">{config.assignmentTitle}</p>
          )}
        </div>

        {/* Customer Info */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal/10 flex items-center justify-center">
              <User className="h-5 w-5 text-teal" />
            </div>
            <div>
              <div className="font-medium text-sm">{persona.name}</div>
              <div className="text-xs text-muted-foreground">
                {persona.membership_status || persona.membership_context || "Member"} · {persona.communication_style}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] border-amber/30 text-amber">
              {persona.initial_emotion}
            </Badge>
            {config.mode === "phone" ? (
              <Badge variant="outline" className="text-[10px] border-border"><Phone className="h-3 w-3 mr-1" /> Phone</Badge>
            ) : config.mode === "live-voice" ? (
              <Badge variant="outline" className="text-[10px] border-border"><Mic className="h-3 w-3 mr-1" /> Live Voice</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-border"><Users className="h-3 w-3 mr-1" /> In-Person</Badge>
            )}
          </div>
        </div>

        {/* Situation */}
        <div className="panel p-4">
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase mb-2">Situation</div>
          <p className="text-sm leading-relaxed">{scenario.situation_summary}</p>
        </div>

        {/* What to handle */}
        {((scenario.must_handle_well || scenario.required_behaviors) ?? []).length > 0 && (
          <div className="panel p-4">
            <div className="text-[10px] font-mono text-muted-foreground tracking-wider uppercase mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber" /> Key Objectives
            </div>
            <ul className="space-y-1.5">
              {(scenario.required_behaviors || scenario.must_handle_well || []).map((item: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-teal mt-0.5">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Turns info */}
        <div className="text-center text-xs text-muted-foreground">
          Target: {scenario.recommended_turns} conversational turns
        </div>
      </div>

      {/* Start Button */}
      <div className="pt-4 pb-2">
        <Button
          onClick={() => setLocation(config.mode === "live-voice" ? "/practice/live" : "/practice/session")}
          className="w-full h-14 bg-teal text-slate-deep hover:bg-teal/90 font-semibold text-base gap-3 rounded-xl"
          size="lg"
        >
          <Play className="h-5 w-5" />
          {config.mode === "live-voice" ? "Join Live Call" : "Begin Session"}
        </Button>
      </div>
    </div>
  );
}
