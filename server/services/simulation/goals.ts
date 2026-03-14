import { getScenarioGoal } from "../../../shared/wsc-content";
import type { ScenarioDirectorResult } from "../ai/contracts";
import type { EmployeeUtteranceAnalysis, SimulationObjective, TurnProgressSummary } from "./types";

function pickAsk(options: string[], turnNumber: number) {
  return options[turnNumber % options.length] || options[0] || "What happens next?";
}

function objectiveMet(objective: SimulationObjective, analysis: EmployeeUtteranceAnalysis) {
  return objective.metBy.some((key) => {
    if (key.startsWith("flag:")) {
      const tone = key.replace("flag:", "");
      return analysis.toneLabels.includes(tone);
    }
    const value = analysis[key as keyof EmployeeUtteranceAnalysis];
    return typeof value === "number" ? value >= 6 : Boolean(value);
  });
}

export function buildScenarioObjectives(scenario: ScenarioDirectorResult): SimulationObjective[] {
  if (scenario.scenario_family === "emergency_response") {
    return [
      { key: "control", label: "take control", metBy: ["explicitOwnership", "explicitSafetyControl"], ask: ["What are you doing right now?", "What is the first thing you are handling right now?"] },
      { key: "direction", label: "give a direct instruction", metBy: ["explicitDirection"], ask: ["What do you need me or the people nearby to do right now?", "Tell me exactly what you need us to do right now."] },
      { key: "stabilize", label: "stabilize until care arrives", metBy: ["explicitTimeline"], ask: ["What is the next update until care arrives?", "What should we expect next until help gets here?"] },
    ];
  }

  if (scenario.department === "mod_emergency") {
    return [
      { key: "ownership", label: "take ownership", metBy: ["explicitOwnership", "explicitSafetyControl"], ask: ["Who is handling this right now?", "What are you doing right now to take control of this?"] },
      { key: "secure", label: "secure the issue", metBy: ["explicitSafetyControl"], ask: ["What is being secured right now?", "What is blocked off or taken out of use right now?"] },
      { key: "update", label: "give the next update", metBy: ["explicitTimeline", "explicitNextStep"], ask: ["When is the next update coming?", "What should I expect next from here?"] },
    ];
  }

  if (scenario.department === "golf") {
    return [
      { key: "warm_open", label: "open with warmth", metBy: ["respectfulness", "empathy", "explicitDiscovery"], ask: ["Can you slow down and meet me first before pitching me?", "Can you help me feel like you actually heard me first?"] },
      { key: "discover", label: "ask discovery questions", metBy: ["explicitDiscovery"], ask: ["Before you pitch me, can you ask what I am actually looking for?", "Can you get a read on what matters to me before recommending something?"] },
      { key: "recommend", label: "make a recommendation", metBy: ["explicitRecommendation"], ask: ["Based on that, what would you actually recommend?", "What do you think is the best fit for me based on what I told you?"] },
      { key: "close", label: "close with a next step", metBy: ["explicitNextStep", "explicitTimeline"], ask: ["What would the next step be if I wanted to move forward today?", "If I said yes, what happens next?"] },
    ];
  }

  return [
    { key: "acknowledge", label: "acknowledge the concern", metBy: ["empathy", "explicitOwnership"], ask: ["I need to know you understand the actual problem here.", "Do you understand why this is a problem for me?"] },
    { key: "verify", label: "verify the facts", metBy: ["explicitVerification", "explicitExplanation"], ask: ["What are you checking or confirming right now?", "What are you checking or confirming right now so this gets clearer?"] },
    { key: "next_step", label: "give a concrete next step", metBy: ["explicitNextStep", "explicitManagerMention"], ask: ["What is the next concrete step from here for me?", "What exactly happens next from here?"] },
    { key: "timeline", label: "set an update timeline", metBy: ["explicitTimeline"], ask: ["When should I expect the next update?", "When exactly am I going to hear back on this?"] },
  ];
}

export function summarizeGoalProgress(params: {
  scenario: ScenarioDirectorResult;
  currentTurnNumber: number;
  priorAnalysis: EmployeeUtteranceAnalysis;
  aggregateAnalysis: EmployeeUtteranceAnalysis;
  hiddenFacts: string[];
}): TurnProgressSummary {
  const goal = getScenarioGoal(params.scenario);
  const objectives = buildScenarioObjectives(params.scenario);
  const metBefore = objectives.filter((objective) => objectiveMet(objective, params.priorAnalysis)).map((objective) => objective.label);
  const metAfter = objectives.filter((objective) => objectiveMet(objective, params.aggregateAnalysis)).map((objective) => objective.label);
  const newlyCompleted = metAfter.filter((label) => !metBefore.includes(label));
  const missingObjectives = objectives.filter((objective) => !objectiveMet(objective, params.aggregateAnalysis));
  const firstHiddenFact = params.hiddenFacts.find((fact) => fact && !/employee should|approved resolution|required behaviors|training/i.test(fact)) || "";
  const hiddenFactRevealed = newlyCompleted.length > 0 && (params.aggregateAnalysis.explicitVerification || params.aggregateAnalysis.explicitDiscovery || params.aggregateAnalysis.explicitExplanation)
    ? firstHiddenFact
    : "";

  return {
    goalTitle: goal.title,
    goalDescription: goal.description,
    objectives,
    metBefore,
    metAfter,
    newlyCompleted,
    missingAfter: missingObjectives.map((objective) => objective.label),
    nextMissing: missingObjectives[0] || null,
    hiddenFactRevealed,
  };
}

export function buildGoalPrompt(progress: TurnProgressSummary, turnNumber: number) {
  if (!progress.nextMissing) {
    return "";
  }
  return pickAsk(progress.nextMissing.ask, turnNumber);
}
