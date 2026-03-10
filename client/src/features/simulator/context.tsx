import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  CoachingNote,
  ConversationTurn,
  EvaluationResult,
  ManagerDebrief,
  ScenarioCard,
  SessionSaveStatus,
  SimulationStateSnapshot,
  SimulatorConfig,
} from "./types";

const STORAGE_KEY = "wsc-simulator-state";

interface PersistedSimulatorState {
  config: SimulatorConfig;
  scenario: ScenarioCard | null;
  conversation: ConversationTurn[];
  stateHistory: SimulationStateSnapshot[];
  evaluation: EvaluationResult | null;
  coaching: CoachingNote | null;
  managerDebrief: ManagerDebrief | null;
  saveStatus: SessionSaveStatus;
  savedSessionId: number | null;
}

interface SimulatorState extends PersistedSimulatorState {
  setConfig: (config: SimulatorConfig) => void;
  setScenario: (scenario: ScenarioCard | null) => void;
  addTurn: (turn: ConversationTurn) => void;
  addStateSnapshot: (snapshot: SimulationStateSnapshot) => void;
  clearConversation: () => void;
  setEvaluation: (evaluation: EvaluationResult | null) => void;
  setCoaching: (coaching: CoachingNote | null) => void;
  setManagerDebrief: (debrief: ManagerDebrief | null) => void;
  setSaveStatus: (status: SessionSaveStatus) => void;
  setSavedSessionId: (sessionId: number | null) => void;
  resetSessionFlow: () => void;
  isSimulating: boolean;
  setIsSimulating: (value: boolean) => void;
  isGenerating: boolean;
  setIsGenerating: (value: boolean) => void;
}

const defaultConfig: SimulatorConfig = {
  department: "customer_service",
  employeeRole: "Front Desk Associate",
  difficulty: 3,
  mode: "in-person",
};

function readPersistedState(): PersistedSimulatorState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<PersistedSimulatorState>;
    return {
      config: parsed.config ?? defaultConfig,
      scenario: parsed.scenario ?? null,
      conversation: parsed.conversation ?? [],
      stateHistory: parsed.stateHistory ?? [],
      evaluation: parsed.evaluation ?? null,
      coaching: parsed.coaching ?? null,
      managerDebrief: parsed.managerDebrief ?? null,
      saveStatus: parsed.saveStatus ?? "idle",
      savedSessionId: parsed.savedSessionId ?? null,
    };
  } catch {
    return null;
  }
}

function writePersistedState(state: PersistedSimulatorState) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures and keep the in-memory session usable.
  }
}

const SimulatorContext = createContext<SimulatorState | null>(null);

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [persisted] = useState(() => readPersistedState());
  const [config, setConfig] = useState<SimulatorConfig>(() => persisted?.config ?? defaultConfig);
  const [scenario, setScenario] = useState<ScenarioCard | null>(() => persisted?.scenario ?? null);
  const [conversation, setConversation] = useState<ConversationTurn[]>(() => persisted?.conversation ?? []);
  const [stateHistory, setStateHistory] = useState<SimulationStateSnapshot[]>(() => persisted?.stateHistory ?? []);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(() => persisted?.evaluation ?? null);
  const [coaching, setCoaching] = useState<CoachingNote | null>(() => persisted?.coaching ?? null);
  const [managerDebrief, setManagerDebrief] = useState<ManagerDebrief | null>(() => persisted?.managerDebrief ?? null);
  const [saveStatus, setSaveStatus] = useState<SessionSaveStatus>(() => persisted?.saveStatus ?? "idle");
  const [savedSessionId, setSavedSessionId] = useState<number | null>(() => persisted?.savedSessionId ?? null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    writePersistedState({
      config,
      scenario,
      conversation,
      stateHistory,
      evaluation,
      coaching,
      managerDebrief,
      saveStatus,
      savedSessionId,
    });
  }, [config, scenario, conversation, stateHistory, evaluation, coaching, managerDebrief, saveStatus, savedSessionId]);

  const addTurn = (turn: ConversationTurn) => {
    setConversation((prev) => [...prev, turn]);
  };

  const addStateSnapshot = (snapshot: SimulationStateSnapshot) => {
    setStateHistory((prev) => [...prev, snapshot]);
  };

  const clearConversation = () => {
    setConversation([]);
  };

  const resetSessionFlow = () => {
    setScenario(null);
    setConversation([]);
    setStateHistory([]);
    setEvaluation(null);
    setCoaching(null);
    setManagerDebrief(null);
    setSaveStatus("idle");
    setSavedSessionId(null);
  };

  return (
    <SimulatorContext.Provider
      value={{
        config,
        setConfig,
        scenario,
        setScenario,
        conversation,
        addTurn,
        stateHistory,
        addStateSnapshot,
        clearConversation,
        evaluation,
        setEvaluation,
        coaching,
        setCoaching,
        managerDebrief,
        setManagerDebrief,
        saveStatus,
        setSaveStatus,
        savedSessionId,
        setSavedSessionId,
        resetSessionFlow,
        isSimulating,
        setIsSimulating,
        isGenerating,
        setIsGenerating,
      }}
    >
      {children}
    </SimulatorContext.Provider>
  );
}

export function useSimulator() {
  const context = useContext(SimulatorContext);
  if (!context) {
    throw new Error("useSimulator must be used within SimulatorProvider");
  }
  return context;
}
