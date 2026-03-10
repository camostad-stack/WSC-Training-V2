import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useState } from "react";
import { Loader2, Mic, Phone, Users, Zap, ChevronLeft, SlidersHorizontal } from "lucide-react";
import {
  clampDifficulty,
  departmentLabels,
  familyLabels,
  getDifficultyRange,
  normalizeDepartmentKey,
  scenarioFamilies,
} from "@/features/simulator/config";
import { useSimulator } from "@/contexts/SimulatorContext";
import { usePracticeLaunch } from "@/features/simulator/usePracticeLaunch";

export default function PracticeSetup() {
  const [, setLocation] = useLocation();
  const { config } = useSimulator();
  const { isStarting, startPractice } = usePracticeLaunch();
  const assignedDepartment = normalizeDepartmentKey(config.department);
  const { min: minDifficulty, max: maxDifficulty } = getDifficultyRange(config);
  const isAssignedDrill = Boolean(config.assignmentId);
  const familyIsLocked = isAssignedDrill && Boolean(config.scenarioFamily);
  const [showAdvanced, setShowAdvanced] = useState(isAssignedDrill);

  const [department, setDepartment] = useState(assignedDepartment);
  const [difficulty, setDifficulty] = useState(clampDifficulty(config.difficulty || 3, minDifficulty, maxDifficulty));
  const [mode, setMode] = useState<"in-person" | "phone" | "live-voice">(config.mode || "in-person");
  const [family, setFamily] = useState<string>(config.scenarioFamily || "");

  const handleGenerate = () => {
    startPractice({
      department,
      difficulty: clampDifficulty(difficulty, minDifficulty, maxDifficulty),
      mode,
      scenarioFamily: family || undefined,
      scenarioTemplateId: config.scenarioTemplateId,
      assignmentId: config.assignmentId,
      assignmentTitle: config.assignmentTitle,
      difficultyMin: config.difficultyMin,
      difficultyMax: config.difficultyMax,
    });
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Practice Setup</h1>
      </div>

      <div className="panel p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-mono text-teal tracking-wider uppercase mb-1">
              {isAssignedDrill ? "Assigned Drill" : "Quick Start"}
            </div>
            <div className="text-sm font-medium">
              {config.assignmentTitle || familyLabels[family || config.scenarioFamily || ""] || "Random practice scenario"}
            </div>
          </div>
          <Badge variant="outline" className="text-[10px] border-border">
            {mode === "phone" ? "Phone" : mode === "live-voice" ? "Live Voice" : "In-Person"}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {departmentLabels[department]} · Difficulty {clampDifficulty(difficulty, minDifficulty, maxDifficulty)}
          {family ? ` · ${familyLabels[family] || family}` : " · Mixed scenario"}
        </div>
        <Button
          onClick={handleGenerate}
          disabled={isStarting}
          className="w-full h-14 bg-teal text-slate-deep hover:bg-teal/90 font-semibold text-base gap-3 rounded-xl"
          size="lg"
        >
          {isStarting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Generating Scenario...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              {isAssignedDrill ? "Start Assigned Practice" : "Start Practice"}
            </>
          )}
        </Button>
        <button
          onClick={() => setShowAdvanced((value) => !value)}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {showAdvanced ? "Hide Practice Options" : "Adjust Practice Options"}
        </button>
      </div>

      {isAssignedDrill && (
        <div className="panel p-4">
          <div className="text-xs text-muted-foreground mt-1">
            Difficulty {minDifficulty}–{maxDifficulty}
            {family ? ` · ${familyLabels[family] || family}` : ""}
          </div>
        </div>
      )}

      {showAdvanced && (
        <>
          <div>
            <label className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2 block">Department</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.entries(departmentLabels) as Array<[keyof typeof departmentLabels, string]>).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (isAssignedDrill) return;
                    setDepartment(key);
                    setFamily("");
                  }}
                  disabled={isAssignedDrill}
                  className={`p-3 rounded-lg border text-left text-sm font-medium transition-colors ${
                    department === key
                      ? "border-teal bg-teal/10 text-teal"
                      : "border-border bg-card text-foreground hover:border-teal/30"
                  } ${isAssignedDrill && department !== key ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2 block">Mode</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setMode("in-person")}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
                  mode === "in-person"
                    ? "border-teal bg-teal/10 text-teal"
                    : "border-border bg-card text-foreground hover:border-teal/30"
                }`}
              >
                <Users className="h-4 w-4" /> In-Person
              </button>
              <button
                onClick={() => setMode("phone")}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
                  mode === "phone"
                    ? "border-teal bg-teal/10 text-teal"
                    : "border-border bg-card text-foreground hover:border-teal/30"
                }`}
              >
                <Phone className="h-4 w-4" /> Phone
              </button>
              <button
                onClick={() => setMode("live-voice")}
                className={`p-3 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${
                  mode === "live-voice"
                    ? "border-teal bg-teal/10 text-teal"
                    : "border-border bg-card text-foreground hover:border-teal/30"
                }`}
              >
                <Mic className="h-4 w-4" /> Live
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2 block">
              Difficulty: <span className="text-teal">{difficulty}</span>
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    if (d < minDifficulty || d > maxDifficulty) return;
                    setDifficulty(d);
                  }}
                  disabled={d < minDifficulty || d > maxDifficulty}
                  className={`flex-1 h-10 rounded-lg border text-sm font-mono font-bold transition-colors ${
                    difficulty === d
                      ? "border-teal bg-teal/10 text-teal"
                      : "border-border bg-card text-muted-foreground hover:border-teal/30"
                  } ${d < minDifficulty || d > maxDifficulty ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-mono text-muted-foreground tracking-wider uppercase mb-2 block">
              Scenario Family <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (familyIsLocked) return;
                  setFamily("");
                }}
                disabled={familyIsLocked}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  !family ? "border-teal bg-teal/10 text-teal" : "border-border bg-card text-muted-foreground hover:border-teal/30"
                } ${familyIsLocked ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                Random
              </button>
              {(scenarioFamilies[department] || []).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    if (familyIsLocked) return;
                    setFamily(f);
                  }}
                  disabled={familyIsLocked}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                    family === f ? "border-teal bg-teal/10 text-teal" : "border-border bg-card text-muted-foreground hover:border-teal/30"
                  } ${familyIsLocked && family !== f ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {familyLabels[f] || f}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
