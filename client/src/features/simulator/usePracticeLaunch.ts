import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useSimulator } from "./context";
import { clampDifficulty, getRoleForDepartment, normalizeDepartmentKey } from "./config";
import type { SimulatorConfig } from "./types";

export function usePracticeLaunch() {
  const [, setLocation] = useLocation();
  const { config, resetSessionFlow, setConfig, setScenario } = useSimulator();

  const generateMutation = trpc.simulator.generateScenario.useMutation({
    onSuccess: (data) => {
      const scenarioData = (data as any)?.scenario ?? data;
      setScenario(scenarioData as any);
      setLocation("/practice/intro");
    },
    onError: () => {
      toast.error("Failed to generate scenario. Please try again.");
    },
  });

  const startPractice = (overrides: Partial<SimulatorConfig> = {}) => {
    const department = normalizeDepartmentKey(overrides.department ?? config.department);
    const difficultyMin = overrides.difficultyMin ?? config.difficultyMin ?? 1;
    const difficultyMax = overrides.difficultyMax ?? config.difficultyMax ?? 5;
    const nextDifficulty = clampDifficulty(
      overrides.difficulty ?? config.difficulty ?? 3,
      difficultyMin,
      difficultyMax,
    );
    const nextConfig: SimulatorConfig = {
      ...config,
      ...overrides,
      department,
      employeeRole: overrides.employeeRole ?? config.employeeRole ?? getRoleForDepartment(department),
      difficulty: nextDifficulty,
      mode: overrides.mode ?? config.mode ?? "in-person",
      difficultyMin,
      difficultyMax,
    };

    resetSessionFlow();
    setConfig(nextConfig);
    generateMutation.mutate({
      department,
      employeeRole: nextConfig.employeeRole,
      difficulty: nextDifficulty,
      mode: nextConfig.mode === "phone"
        ? "phone"
        : nextConfig.mode === "live-voice"
          ? "live_voice"
          : "in_person",
      scenarioFamily: nextConfig.scenarioFamily,
      scenarioTemplateId: nextConfig.scenarioTemplateId,
    });
  };

  return {
    startPractice,
    isStarting: generateMutation.isPending,
  };
}
