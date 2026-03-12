import { and, eq, isNull, or } from "drizzle-orm";
import { policyDocuments } from "../../../drizzle/schema";
import { WSC_POLICY_CONTEXT, EMPLOYEE_PROFILE_UPDATER_SYSTEM } from "../../prompts";
import { getDb } from "../../db";
import { ENV } from "../../_core/env";
import {
  adaptiveDifficultyResultSchema,
  type AdaptiveDifficultyResult,
  type CoachingResult,
  coachingResultSchema,
  type CustomerReplyResult,
  customerReplyResultSchema,
  type EvaluationResult,
  evaluationResultSchema,
  type ManagerDebriefResult,
  managerDebriefResultSchema,
  mediaInputSchema,
  type MediaInput,
  type PolicyGroundingResult,
  policyGroundingResultSchema,
  type ProfileUpdateResult,
  profileUpdateResultSchema,
  type ScenarioDirectorResult,
  scenarioDirectorResultSchema,
  type SessionQualityResult,
  sessionQualityResultSchema,
  type StateUpdateResult,
  stateHistorySchema,
  stateUpdateResultSchema,
  type TranscriptTurn,
  transcriptSchema,
  type VisibleBehaviorResult,
  visibleBehaviorResultSchema,
} from "./contracts";
import { PromptExecutionError, type PipelineFailure } from "./errors";
import { runPrompt } from "./prompt-runner";
import { AI_SERVICE_REGISTRY } from "./registry";
import { selectRelevantPolicies } from "../policy-matching";
import { departmentLabels, familyLabels, getScenarioGoal, scenarioFamiliesByDepartment } from "../../../shared/wsc-content";
import { WSC_SCENARIO_TEMPLATE_SEEDS } from "../../wsc-seed-data";

const DEFAULT_CATEGORY_SCORES = {
  opening_warmth: 0,
  listening_empathy: 0,
  clarity_directness: 0,
  policy_accuracy: 0,
  ownership: 0,
  problem_solving: 0,
  de_escalation: 0,
  escalation_judgment: 0,
  visible_professionalism: 0,
  closing_control: 0,
} as const;

export interface EvaluationPipelineResult {
  processingStatus: "completed" | "invalid" | "reprocess";
  failure?: PipelineFailure;
  policyGrounding: PolicyGroundingResult;
  visibleBehavior: VisibleBehaviorResult;
  sessionQuality: SessionQualityResult;
  evaluation: EvaluationResult;
  coaching: CoachingResult;
  managerDebrief: ManagerDebriefResult;
  policyContext: string;
}

function clampRecommendedTurns(value?: number) {
  return Math.max(3, Math.min(5, value ?? 4));
}

function clampScore(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function formatTranscript(transcript: TranscriptTurn[]) {
  return transcript
    .map(turn => `${turn.role === "customer" ? "Customer" : "Employee"}${turn.emotion ? ` [${turn.emotion}]` : ""}: ${turn.message}`)
    .join("\n");
}

function chooseScenarioSeed(params: {
  department: string;
  scenarioFamily?: string;
  difficulty: number;
}) {
  const byDepartment = WSC_SCENARIO_TEMPLATE_SEEDS.filter(seed => seed.department === params.department);
  const byFamily = params.scenarioFamily
    ? byDepartment.filter(seed => seed.scenarioFamily === params.scenarioFamily)
    : byDepartment;
  const candidates = (byFamily.length > 0 ? byFamily : byDepartment).sort((a, b) => {
    return Math.abs(a.difficulty - params.difficulty) - Math.abs(b.difficulty - params.difficulty);
  });
  return candidates[0] ?? WSC_SCENARIO_TEMPLATE_SEEDS[0];
}

function buildLocalScenario(params: {
  department: string;
  employeeRole: string;
  difficulty: number;
  scenarioFamily?: string;
}): ScenarioDirectorResult {
  const seed = chooseScenarioSeed(params);
  return scenarioDirectorResultSchema.parse({
    scenario_id: `local-${seed.scenarioFamily}-${seed.difficulty}`,
    department: seed.department,
    employee_role: params.employeeRole || seed.targetRole,
    difficulty: params.difficulty,
    scenario_family: seed.scenarioFamily,
    customer_persona: seed.customerPersona,
    situation_summary: seed.situationSummary,
    opening_line: seed.openingLine,
    hidden_facts: seed.hiddenFacts || [],
    approved_resolution_paths: seed.approvedResolutionPaths || [],
    required_behaviors: seed.requiredBehaviors || [],
    critical_errors: seed.criticalErrors || [],
    branch_logic: seed.branchLogic || {},
    emotion_progression: seed.emotionProgression || {},
    completion_rules: seed.completionRules || {},
    recommended_turns: clampRecommendedTurns(seed.recommendedTurns),
  });
}

function scoreEmployeeMessage(message: string) {
  const lower = message.toLowerCase();
  const empathy = /\bsorry\b|\bunderstand\b|\bfrustrat|\bthat makes sense\b|\bi can see\b/.test(lower);
  const ownership = /\bi will\b|\bi'll\b|\blet me\b|\bi can\b|\bi'm going to\b|\btaking ownership\b|\bown this\b|\bi'm on it\b|\bi have this\b/.test(lower);
  const direct = message.trim().split(/\s+/).length >= 8 && !/\bmaybe\b|\bprobably\b|\bkind of\b/.test(lower);
  const policy = /\bpolicy\b|\bverify\b|\bcheck\b|\baccount\b|\breservation\b|\bmanager\b|\bfollow up\b|\btoday\b|\bminutes\b|\bcredit\b|\bcancel\b/.test(lower);
  const avoidant = /\bnot my\b|\bcan't help\b|\bdon't know\b|\byou need to\b|\bcall your bank\b/.test(lower);
  const critical = /\bcalm down\b|\bthat's not our fault\b|\bnothing we can do\b|\bcall your bank\b/.test(lower);
  const escalation = /\bmanager\b|\bsupervisor\b|\bmod\b/.test(lower);
  const acknowledgment = empathy || /\bthanks for telling me\b|\bi hear you\b|\bi get why\b|\bthat sounds\b|\bthat would be frustrating\b/.test(lower);
  const verification = /\bverify\b|\bcheck\b|\breview\b|\bconfirm\b|\blook into\b|\bpull up\b|\baccount\b|\bledger\b|\breservation\b/.test(lower);
  const explanation = /\bexplain\b|\bclarify\b|\bwhat happened\b|\bhere'?s why\b|\bwhy this happened\b|\bwhy you were\b|\bpending\b|\bfinal\b|\bstatus\b|\bmeans\b/.test(lower);
  const nextStep = /\bnext step\b|\bprocess\b|\brebook\b|\brefund\b|\breverse\b|\bcredit\b|\bschedule\b|\bbook\b|\bhold a spot\b|\bupdate you\b|\bfollow up\b|\bwalk you through\b|\bget that moving\b|\bset that up\b|\bget you into\b|\bopen slot\b|\bmove you to\b|\bconfirm it\b/.test(lower);
  const timeline = /\bwithin\b|\bby\b|\btoday\b|\bbefore\b|\bafter\b|\bminutes\b|\bhours\b|\bthis afternoon\b|\bthis morning\b|\btonight\b|\bnext update\b|\byou will hear\b/.test(lower);
  const discovery = /\?/.test(message) || /\bwhat are you looking for\b|\bwhat matters most\b|\bhow often\b|\btell me about\b|\bwhat kind of\b|\bwhat are you hoping\b/.test(lower);
  const recommendation = /\brecommend\b|\bbest fit\b|\bfor someone like you\b|\bi'd suggest\b|\bhere's the best option\b/.test(lower);
  const close = /\bmove forward\b|\bnext step\b|\bbook\b|\bschedule\b|\bget started\b|\bhold a spot\b|\bset that up\b|\bready to\b/.test(lower);
  const safetyAction = /\b911\b|\bems\b|\bemergency response\b|\bactivate\b|\bsecure\b|\bblock\b|\bblocking\b|\btag out\b|\btagging\b|\btag it out\b|\bout of use\b|\bclose the area\b|\bclear the area\b|\bstabilize\b|\bcare arrives\b/.test(lower);
  const direction = /\bstay\b|\bkeep\b|\bclear\b|\bmove\b|\bleave\b|\bstep back\b|\bdo not\b|\bmeet ems\b|\bkeep people back\b|\bcome with me\b/.test(lower);
  const reassurance = /\bhelp is on the way\b|\bi'll keep you updated\b|\bwe're with you\b|\byou're not alone\b|\bi've got this\b/.test(lower);
  const warmth = /\bwelcome\b|\bglad you came in\b|\bhappy to help\b|\bgood to meet you\b|\bthanks for coming in\b/.test(lower);
  const stabilize = /\bstabilize\b|\buntil care arrives\b|\buntil help arrives\b|\buntil ems arrives\b/.test(lower);
  return {
    empathy,
    ownership,
    direct,
    policy,
    avoidant,
    critical,
    escalation,
    acknowledgment,
    verification,
    explanation,
    nextStep,
    timeline,
    discovery,
    recommendation,
    close,
    safetyAction,
    direction,
    reassurance,
    warmth,
    stabilize,
  };
}

function hasPatternMatch(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text));
}

type EmployeeSignalProfile = ReturnType<typeof scoreEmployeeMessage>;

type ObjectiveDefinition = {
  key: string;
  label: string;
  met: (signals: EmployeeSignalProfile) => boolean;
  ask: (ctx: { improved: boolean; stalled: boolean }) => string;
};

type GoalProgress = {
  goal: ReturnType<typeof getScenarioGoal>;
  goalAdvanced: boolean;
  goalResolved: boolean;
  trustDelta: number;
  clarityDelta: number;
  reply: string;
  progressSummary: string;
  nextMissing: string | null;
  completedThisTurn: string[];
};

function combineEmployeeSignals(messages: string[]) {
  return scoreEmployeeMessage(messages.join("\n"));
}

function buildScenarioObjectives(scenario: ScenarioDirectorResult): ObjectiveDefinition[] {
  if (scenario.scenario_family === "emergency_response") {
    return [
      {
        key: "take_control",
        label: "take control immediately",
        met: (signals) => signals.ownership || signals.safetyAction,
        ask: ({ improved }) => improved
          ? "What do you need me or anyone nearby to do right now while you take control?"
          : "Tell me the immediate emergency step right now. What are you doing first?",
      },
      {
        key: "give_direction",
        label: "give a direct instruction",
        met: (signals) => signals.direction,
        ask: ({ improved, stalled }) => improved
          ? "What do you need us to do right now while care is moving?"
          : stalled
            ? "I still need a direct instruction. What should I do right now?"
            : "What do you need me to do right now while you handle the patient?",
      },
      {
        key: "stabilize_until_care_arrives",
        label: "stabilize until care arrives",
        met: (signals) => signals.stabilize || (signals.reassurance && signals.timeline),
        ask: ({ improved, stalled }) => improved
          ? "What is the next update until care arrives?"
          : stalled
            ? "I still need to know what happens next until care arrives."
            : "What is the next update until care arrives?",
      },
    ];
  }

  if (scenario.department === "mod_emergency") {
    return [
      {
        key: "own_the_situation",
        label: "take ownership",
        met: (signals) => signals.ownership || signals.safetyAction,
        ask: ({ improved }) => improved
          ? "What is secured right now?"
          : "What are you doing right now to take control and make this safe?",
      },
      {
        key: "secure_or_direct",
        label: "secure the issue",
        met: (signals) => signals.safetyAction || signals.direction,
        ask: ({ improved, stalled }) => improved
          ? "What is being secured right now, and what do you need people to do?"
          : stalled
            ? "I still need the actual safety step. What is secured right now?"
            : "What is being secured right now, and what do you need people to do?",
      },
      {
        key: "give_next_update",
        label: "give the next update",
        met: (signals) => signals.timeline || signals.nextStep,
        ask: ({ improved, stalled }) => improved
          ? "When is the next update coming?"
          : stalled
            ? "I still do not know what happens next from here."
            : "What is the next update from here?",
      },
    ];
  }

  if (scenario.department === "golf") {
    return [
      {
        key: "open_warm",
        label: "open with warmth",
        met: (signals) => signals.warmth || signals.empathy,
        ask: ({ improved }) => improved
          ? "Can you stay with me for a second before pitching me?"
          : "Can you slow down and meet me first before pitching me?",
      },
      {
        key: "discover_need",
        label: "ask discovery questions",
        met: (signals) => signals.discovery,
        ask: ({ improved, stalled }) => improved
          ? "Before you pitch me, can you ask what I’m actually looking for?"
          : stalled
            ? "You are still talking at me. Can you ask what I am actually looking for?"
            : "Before you pitch me, can you ask what I’m actually looking for?",
      },
      {
        key: "recommend_fit",
        label: "make a recommendation",
        met: (signals) => signals.recommendation,
        ask: ({ improved, stalled }) => improved
          ? "Based on that, what would you actually recommend for me?"
          : stalled
            ? "I still do not know what you would recommend for someone like me."
            : "Based on what I told you, what would you actually recommend for someone like me?",
      },
      {
        key: "close_next_step",
        label: "close with a next step",
        met: (signals) => signals.close || signals.timeline || signals.nextStep,
        ask: ({ improved, stalled }) => improved
          ? "What would that look like if I wanted to move today?"
          : stalled
            ? "I still do not know the next step if I wanted to move forward."
            : "What would the next step be if I wanted to move forward today?",
      },
    ];
  }

  return [
    {
      key: "acknowledge_or_own",
      label: "acknowledge the concern",
      met: (signals) => signals.acknowledgment || signals.ownership,
      ask: ({ improved }) => improved
        ? "What are you checking or confirming right now?"
        : "I need to know you understand the actual problem and that someone is taking ownership of it.",
    },
      {
        key: "verify_or_explain",
        label: "verify the facts",
        met: (signals) => signals.verification || signals.explanation || signals.policy,
        ask: ({ improved, stalled }) => improved
        ? "What are you checking or confirming right now?"
        : stalled
          ? "I still do not know what you are checking or what is actually true here."
          : "Okay. What are you checking or doing right now to move this forward?",
    },
      {
        key: "give_next_step",
        label: "give a next step",
        met: (signals) => signals.nextStep || signals.escalation,
        ask: ({ improved, stalled }) => improved
        ? "What is the next concrete step from here for me?"
        : stalled
          ? "I still need the actual next step, not just general reassurance."
          : "What is the next concrete step from here for me?",
    },
    {
      key: "set_timeline",
      label: "set an update timeline",
      met: (signals) => signals.timeline,
      ask: ({ stalled }) => stalled
        ? "I still do not know when I should expect the update."
        : "When exactly should I expect the next update from you?",
    },
  ];
}

function buildResolvedReply(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") {
    return "Okay. I understand. I will do that. Keep me updated until care arrives.";
  }
  if (scenario.department === "mod_emergency") {
    return "Okay. That sounds controlled. Keep the response moving and let me know the next update.";
  }
  if (scenario.department === "golf") {
    return "Okay. That feels specific and helpful. I can picture the next step now.";
  }
  return "Okay. That gives me a clear next step and a real update to expect.";
}

function buildProgressPrefix(params: {
  scenario: ScenarioDirectorResult;
  newlyCompletedLabels: string[];
}) {
  const firstCompleted = params.newlyCompletedLabels[0];

  if (!firstCompleted) {
    return "";
  }

  if (params.scenario.scenario_family === "emergency_response") {
    if (firstCompleted === "take control immediately") return "Okay. I can hear you taking control.";
    if (firstCompleted === "give a direct instruction") return "Okay. That gives me something clear to do.";
    return "Okay. I hear you.";
  }

  if (params.scenario.department === "golf") {
    if (firstCompleted === "open with warmth") return "Okay. This already feels easier to work with.";
    if (firstCompleted === "ask discovery questions") return "Okay. That helps me feel like you are actually listening.";
    if (firstCompleted === "make a recommendation") return "Okay. That is more specific.";
    return "Okay. That helps.";
  }

  if (firstCompleted === "acknowledge the concern") return "Okay. I can hear you taking this seriously.";
  if (firstCompleted === "verify the facts") return "Okay. That helps.";
  if (firstCompleted === "give a next step") return "Alright. That is more concrete.";
  return "Okay. That makes things clearer.";
}

function assessGoalProgress(params: {
  scenario: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  employeeResponse: string;
  score: ReturnType<typeof scoreEmployeeMessage>;
}): GoalProgress {
  const goal = getScenarioGoal(params.scenario);
  const transcriptAlreadyIncludesLatestEmployeeTurn = params.transcript[params.transcript.length - 1]?.role === "employee";
  const priorTranscript = transcriptAlreadyIncludesLatestEmployeeTurn
    ? params.transcript.slice(0, -1)
    : params.transcript;
  const priorEmployeeMessages = priorTranscript
    .filter((turn) => turn.role === "employee")
    .map((turn) => turn.message);
  const allEmployeeMessages = [...priorEmployeeMessages, params.employeeResponse];
  const priorSignals = combineEmployeeSignals(priorEmployeeMessages);
  const combinedSignals = combineEmployeeSignals(allEmployeeMessages);
  const objectives = buildScenarioObjectives(params.scenario);
  const missingObjectives = objectives.filter((objective) => !objective.met(combinedSignals));
  const newlyCompleted = objectives.filter((objective) => !objective.met(priorSignals) && objective.met(combinedSignals));
  const stalled = newlyCompleted.length === 0 && priorEmployeeMessages.length > 0;
  const goalResolved = missingObjectives.length === 0;

  if (goalResolved) {
    return {
      goal,
      goalAdvanced: true,
      goalResolved: true,
      trustDelta: 1,
      clarityDelta: 2,
      reply: buildResolvedReply(params.scenario),
      progressSummary: `Goal resolved. Completed objectives: ${objectives.map((objective) => objective.label).join(", ")}.`,
      nextMissing: null,
      completedThisTurn: newlyCompleted.map((objective) => objective.label),
    };
  }

  const nextObjective = missingObjectives[0];
  const prefix = buildProgressPrefix({
    scenario: params.scenario,
    newlyCompletedLabels: newlyCompleted.map((objective) => objective.label),
  });
  const followUp = nextObjective.ask({
    improved: newlyCompleted.length > 0,
    stalled,
  });

  return {
    goal,
    goalAdvanced: newlyCompleted.length > 0,
    goalResolved: false,
    trustDelta: 0,
    clarityDelta: newlyCompleted.length > 0 ? 1 : 0,
    reply: `${prefix} ${followUp}`.trim(),
    progressSummary: `Operational goal: ${goal.title}. Completed this turn: ${newlyCompleted.map((objective) => objective.label).join(", ") || "none"}. Still missing: ${missingObjectives.map((objective) => objective.label).join(", ")}.`,
    nextMissing: nextObjective.label,
    completedThisTurn: newlyCompleted.map((objective) => objective.label),
  };
}

function isSafetyOrUrgentScenario(scenario: ScenarioDirectorResult) {
  return scenario.department === "mod_emergency"
    || ["slippery_entry_complaint", "unsafe_equipment_report", "weather_range_incident", "emergency_response"].includes(scenario.scenario_family);
}

type PriorityCategory = keyof typeof DEFAULT_CATEGORY_SCORES;

function getScenarioPriorityProfile(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") {
    return {
      primary: ["ownership", "problem_solving", "escalation_judgment", "clarity_directness", "visible_professionalism"] as PriorityCategory[],
      secondary: ["listening_empathy", "de_escalation"] as PriorityCategory[],
      deEmphasized: ["opening_warmth", "policy_accuracy", "closing_control"] as PriorityCategory[],
      guidance: [
        "Focus on the actual patient or incident first, not policy recital.",
        "Reward scene control, direct instructions, ownership, and stabilizing the situation until care arrives.",
        "Do not over-penalize a lack of polished service language during active emergency control.",
      ],
      practiceFocus: "stabilize_until_care_arrives",
    };
  }

  if (scenario.department === "mod_emergency") {
    return {
      primary: ["ownership", "problem_solving", "escalation_judgment", "clarity_directness"] as PriorityCategory[],
      secondary: ["de_escalation", "visible_professionalism", "listening_empathy"] as PriorityCategory[],
      deEmphasized: ["opening_warmth"] as PriorityCategory[],
      guidance: [
        "Prioritize safety control, operational ownership, and a clear next action.",
        "Treat reassurance as useful when it supports control, not as a substitute for action.",
      ],
      practiceFocus: "ownership_and_problem_solving",
    };
  }

  if (scenario.department === "golf") {
    return {
      primary: ["opening_warmth", "listening_empathy", "problem_solving", "closing_control"] as PriorityCategory[],
      secondary: ["clarity_directness", "ownership"] as PriorityCategory[],
      deEmphasized: ["escalation_judgment"] as PriorityCategory[],
      guidance: [
        "Prioritize opening warmth, discovery, confidence, and a clean close.",
        "In sales-service scenarios, the employee should sound helpful and commercially competent, not rushed or defensive.",
      ],
      practiceFocus: "opening_warmth_and_closing_control",
    };
  }

  return {
    primary: ["listening_empathy", "ownership", "clarity_directness", "closing_control"] as PriorityCategory[],
    secondary: ["problem_solving", "de_escalation"] as PriorityCategory[],
    deEmphasized: [] as PriorityCategory[],
    guidance: [
      "Prioritize calm acknowledgment, practical ownership, and a clean next step.",
      "Score the employee on whether they moved the real situation forward, not whether they sounded polished for its own sake.",
    ],
    practiceFocus: "humanistic_ownership",
  };
}

function buildScenarioPriorityLens(scenario: ScenarioDirectorResult) {
  const profile = getScenarioPriorityProfile(scenario);
  return [
    `Primary scoring priorities: ${profile.primary.join(", ")}`,
    `Secondary priorities: ${profile.secondary.join(", ") || "none"}`,
    `De-emphasized categories: ${profile.deEmphasized.join(", ") || "none"}`,
    ...profile.guidance,
  ].join("\n");
}

function applyScenarioPriorityWeights(
  scenario: ScenarioDirectorResult,
  categoryScores: Record<PriorityCategory, number>,
) {
  const profile = getScenarioPriorityProfile(scenario);
  const adjusted = { ...categoryScores };

  for (const key of profile.primary) adjusted[key] = clampScore(adjusted[key] + 2);
  for (const key of profile.secondary) adjusted[key] = clampScore(adjusted[key] + 1);
  for (const key of profile.deEmphasized) adjusted[key] = clampScore(adjusted[key] - 1);

  return adjusted;
}

function buildIdealResponseExample(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") {
    return "I am activating emergency response now. Stay with them if it is safe, keep the area clear, and I will keep control of this until care arrives.";
  }

  if (scenario.department === "mod_emergency") {
    return "I am taking ownership of this now. Here is the immediate safety step, who is responding, and when you will get the next update.";
  }

  if (scenario.department === "golf") {
    return "Thanks for coming in. Let me understand what you are trying to get out of the club, then I will point you to the best fit and close on the next step.";
  }

  return `I can see why this would be concerning. Let me handle the next step now and tell you exactly what happens next for ${familyLabels[scenario.scenario_family] || "this issue"}.`;
}

function buildScenarioCoachingGuidance(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") {
    return {
      doThisNextTime: [
        "Take control in the first sentence and say what is happening right now.",
        "Give one or two simple directions that stabilize the person or scene until care arrives.",
        "Keep updates factual and brief instead of drifting into policy or explanation.",
      ],
      replacementPhrases: [
        "I am taking control of this now.",
        "Stay with them if it is safe. Help is moving and I will keep you updated.",
      ],
    };
  }

  if (scenario.department === "mod_emergency") {
    return {
      doThisNextTime: [
        "Lead with the immediate safety action before discussing follow-up.",
        "State who is responding and what is being secured right now.",
        "Close with the next operational update so the member knows what happens next.",
      ],
      replacementPhrases: [
        "I am handling the immediate safety step now.",
        "Here is what is being secured, and here is the next update you can expect.",
      ],
    };
  }

  if (scenario.department === "golf") {
    return {
      doThisNextTime: [
        "Open warmer so the prospect or member feels helped instead of pitched.",
        "Ask one clean discovery question before explaining value or options.",
        "Close with a firm next step instead of leaving the conversation open-ended.",
      ],
      replacementPhrases: [
        "Welcome in. Let me get a quick read on what you want out of this so I can point you the right way.",
        "Based on what you told me, here is the best fit and the next step to get it moving.",
      ],
    };
  }

  return {
    doThisNextTime: [
      "Acknowledge the concern in the first sentence in plain human language.",
      "State the next concrete step and timeline.",
      "Close the loop so the member knows who owns the follow-up.",
    ],
    replacementPhrases: [
      "I can see why that would be concerning.",
      "Here is what I am doing next, and here is when you will hear back.",
    ],
  };
}

function buildLocalTurnResponse(params: {
  scenario: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  priorState?: Partial<StateUpdateResult>;
  employeeResponse: string;
}) {
  const employeeTurns = params.transcript.filter(turn => turn.role === "employee").length;
  const transcriptAlreadyIncludesLatestEmployeeTurn = params.transcript[params.transcript.length - 1]?.role === "employee";
  const currentTurnNumber = transcriptAlreadyIncludesLatestEmployeeTurn ? employeeTurns : employeeTurns + 1;
  const score = scoreEmployeeMessage(params.employeeResponse);
  const safetyOrUrgent = isSafetyOrUrgentScenario(params.scenario);
  const goalProgress = assessGoalProgress({
    scenario: params.scenario,
    transcript: params.transcript,
    employeeResponse: params.employeeResponse,
    score,
  });
  const priorTrust = params.priorState?.trust_level ?? 3;
  const priorClarity = params.priorState?.issue_clarity ?? 3;
  const trust = clampScore(
    priorTrust
    + (score.empathy ? 1 : safetyOrUrgent ? 0 : -1)
    + (score.ownership ? 1 : 0)
    + (score.direct ? 1 : 0)
    + (score.critical ? -4 : 0)
    + (score.avoidant ? -2 : 0),
    0,
    10,
  );
  const adjustedTrust = clampScore(
    trust + goalProgress.trustDelta,
  );
  const issueClarity = clampScore(
    priorClarity + (score.direct ? 1 : 0) + (score.policy ? 1 : 0) + (score.avoidant ? -2 : 0) + goalProgress.clarityDelta,
  );
  const managerNeeded = score.critical || (score.escalation && !score.ownership) || (safetyOrUrgent && !score.ownership && !score.direct);
  const scenarioComplete = score.critical
    || currentTurnNumber >= params.scenario.recommended_turns
    || (currentTurnNumber >= 3 && goalProgress.goalResolved && issueClarity >= 6);
  const updatedEmotion = score.critical
    ? safetyOrUrgent ? "alarmed" : "upset"
    : goalProgress.goalResolved
      ? safetyOrUrgent ? "steady" : "reassured"
      : adjustedTrust >= 7
      ? safetyOrUrgent ? "steady" : "reassured"
      : adjustedTrust >= 5
        ? safetyOrUrgent ? "steady" : "calmer"
        : safetyOrUrgent ? "concerned" : "guarded";
  const hiddenFact = goalProgress.goalAdvanced
    && employeeTurns <= 2
    && (score.verification || score.explanation || score.discovery || score.recommendation || score.direction || score.safetyAction)
      ? params.scenario.hidden_facts[0] || ""
      : "";
  const customerReply = score.critical
    ? safetyOrUrgent
      ? "I need someone taking control right now. Tell me the immediate safety step."
      : "That answer makes this worse. I need a manager involved now."
    : goalProgress.goalResolved && adjustedTrust >= 6
      ? `${goalProgress.reply} ${hiddenFact}`.trim()
      : `${goalProgress.reply} ${hiddenFact}`.trim();

  return {
    customerReply: customerReplyResultSchema.parse({
      customer_reply: customerReply,
      updated_emotion: updatedEmotion,
      trust_level: adjustedTrust,
      issue_clarity: issueClarity,
      manager_needed: managerNeeded,
      scenario_complete: scenarioComplete,
      completion_reason: scenarioComplete ? (score.critical ? "critical_error" : "issue_clarified") : "",
      new_hidden_fact_revealed: hiddenFact,
      director_notes: {
        employee_showed_empathy: score.empathy,
        employee_was_clear: score.direct,
        employee_used_correct_policy: score.policy,
        employee_took_ownership: score.ownership,
        employee_should_be_pushed_harder: !goalProgress.goalResolved,
      },
    }),
    stateUpdate: stateUpdateResultSchema.parse({
      turn_number: currentTurnNumber,
      emotion_state: updatedEmotion,
      trust_level: adjustedTrust,
      issue_clarity: issueClarity,
      employee_flags: {
        showed_empathy: score.empathy,
        answered_directly: score.direct,
        used_correct_policy: score.policy,
        took_ownership: score.ownership,
        avoided_question: score.avoidant,
        critical_error: score.critical,
      },
      escalation_required: managerNeeded,
      scenario_risk_level: score.critical ? "high" : trust >= 6 ? "low" : "moderate",
      continue_simulation: !scenarioComplete,
    }),
  };
}

function buildLocalEvaluation(params: {
  scenarioJson: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  policyContext: string;
}): EvaluationPipelineResult {
  const priorityProfile = getScenarioPriorityProfile(params.scenarioJson);
  const scenarioGoal = getScenarioGoal(params.scenarioJson);
  const emergencyResponse = params.scenarioJson.scenario_family === "emergency_response";
  const employeeTurns = params.transcript.filter(turn => turn.role === "employee");
  const scores = employeeTurns.map(turn => scoreEmployeeMessage(turn.message));
  const total = Math.max(scores.length, 1);
  const count = (key: keyof ReturnType<typeof scoreEmployeeMessage>) => scores.filter(score => score[key]).length;
  const empathyCount = count("empathy");
  const ownershipCount = count("ownership");
  const directCount = count("direct");
  const policyCount = count("policy");
  const avoidantCount = count("avoidant");
  const criticalCount = count("critical");
  const escalationCount = count("escalation");

  const baseCategoryScores = evaluationResultSchema.shape.category_scores.parse({
    opening_warmth: clampScore((empathyCount / total) * 10),
    listening_empathy: clampScore((empathyCount / total) * 10),
    clarity_directness: clampScore((directCount / total) * 10),
    policy_accuracy: clampScore(emergencyResponse ? ((directCount + ownershipCount) / (2 * total)) * 10 : (policyCount / total) * 10),
    ownership: clampScore((ownershipCount / total) * 10),
    problem_solving: clampScore(((ownershipCount + directCount) / (2 * total)) * 10),
    de_escalation: clampScore((((empathyCount + ownershipCount) / (2 * total)) * 10) - criticalCount * 2),
    escalation_judgment: clampScore((escalationCount > 0 || criticalCount === 0) ? 7 : 4),
    visible_professionalism: clampScore(8 - criticalCount * 3 - avoidantCount * 2),
    closing_control: clampScore((ownershipCount / total) * 10),
  });
  const categoryScores = evaluationResultSchema.shape.category_scores.parse(
    applyScenarioPriorityWeights(params.scenarioJson, baseCategoryScores),
  );

  const overallScore = Math.round(
    (Object.values(categoryScores).reduce((sum, value) => sum + value, 0) / Object.values(categoryScores).length) * 10,
  );
  const passFail = overallScore >= 75 ? "pass" : overallScore >= 60 ? "borderline" : "fail";
  const readiness = overallScore >= 85 ? "independent" : overallScore >= 75 ? "partially_independent" : overallScore >= 60 ? "shadow_ready" : "practice_more";
  const bestMoments = [
    empathyCount > 0
      ? params.scenarioJson.department === "golf"
        ? "Opened in a way that made the customer easier to work with."
        : "Acknowledged the member's concern directly."
      : null,
    ownershipCount > 0 ? "Took ownership for the next step." : null,
    directCount > 0 ? "Kept the answer concrete instead of vague." : null,
    ownershipCount > 0 && directCount > 0 ? `Moved the conversation toward the real goal: ${scenarioGoal.title}.` : null,
    emergencyResponse && ownershipCount > 0 && directCount > 0 ? "Stayed focused on stabilizing the situation until care arrived." : null,
  ].filter(Boolean) as string[];
  const missedMoments = [
    empathyCount === 0
      ? params.scenarioJson.department === "golf"
        ? "Did not create enough opening warmth before moving into the ask or explanation."
        : "Did not clearly acknowledge the person's concern or human impact."
      : null,
    !emergencyResponse && policyCount === 0 ? "Did not anchor the response in club policy or verification." : null,
    avoidantCount > 0 ? "Used avoidant phrasing instead of owning the issue." : null,
    emergencyResponse && ownershipCount === 0 ? "Did not take firm control of the emergency response." : null,
    params.scenarioJson.department === "golf" && ownershipCount > 0 && directCount === 0 ? "Did not close with enough control or a clean next step." : null,
  ].filter(Boolean) as string[];
  const coachingGuidance = buildScenarioCoachingGuidance(params.scenarioJson);

  const evaluation = evaluationResultSchema.parse({
    overall_score: overallScore,
    pass_fail: passFail,
    readiness_signal: readiness,
    category_scores: categoryScores,
    best_moments: bestMoments,
    missed_moments: missedMoments,
    critical_mistakes: criticalCount > 0 ? ["Used language that would escalate or abandon the issue."] : [],
    coachable_mistakes: avoidantCount > 0 ? ["Replace vague or deflecting phrases with ownership and a next step."] : [],
    most_important_correction: missedMoments[0] || `Keep the conversation grounded in the actual goal: ${scenarioGoal.title}.`,
    ideal_response_example: buildIdealResponseExample(params.scenarioJson),
    summary: `Local evaluation completed for ${familyLabels[params.scenarioJson.scenario_family] || params.scenarioJson.scenario_family}. Goal: ${scenarioGoal.title}. Priority lens: ${priorityProfile.primary.join(", ")}.`,
  });

  return {
    processingStatus: "completed",
    policyContext: params.policyContext,
    policyGrounding: policyGroundingResultSchema.parse({
      policy_accuracy: policyCount > 0 ? "partially_correct" : "not_evaluated",
      matched_policy_points: policyCount > 0 || emergencyResponse ? ["Referenced verification, control, or escalation instead of guessing."] : [],
      missed_policy_points: policyCount === 0 && !emergencyResponse ? ["Needed a clearer policy or verification statement."] : [],
      invented_or_risky_statements: criticalCount > 0 ? ["Risky phrasing increased customer friction."] : [],
      should_have_escalated: escalationCount > 0,
      policy_notes: emergencyResponse
        ? "Immediate emergency control was prioritized over policy recital in the scoring lens."
        : "Local fallback policy grounding used because no AI provider is configured.",
    }),
    visibleBehavior: visibleBehaviorResultSchema.parse({
      assessment_status: "not_available",
      usable_for_scoring: false,
      flags: ["no_media"],
      summary: "Visible behavior was not scored in local fallback mode.",
      retry_recommended: false,
    }),
    sessionQuality: sessionQualityResultSchema.parse({
      session_quality: "usable",
      flags: ["local_fallback"],
      reason: "Deterministic localhost evaluation was used because no AI provider is configured.",
      retry_recommended: false,
    }),
    evaluation,
    coaching: coachingResultSchema.parse({
      employee_coaching_summary: evaluation.summary,
      what_you_did_well: bestMoments,
      what_hurt_you: missedMoments,
      do_this_next_time: coachingGuidance.doThisNextTime,
      replacement_phrases: coachingGuidance.replacementPhrases,
      practice_focus: missedMoments[0] ? priorityProfile.practiceFocus : scenarioGoal.title.toLowerCase().replace(/\s+/g, "_"),
      next_recommended_scenario: params.scenarioJson.scenario_family,
    }),
    managerDebrief: managerDebriefResultSchema.parse({
      manager_summary: `Local fallback scoring for ${familyLabels[params.scenarioJson.scenario_family] || params.scenarioJson.scenario_family}. Goal: ${scenarioGoal.title}. Priority lens: ${priorityProfile.primary.join(", ")}.`,
      performance_signal: overallScore >= 75 ? "green" : overallScore >= 60 ? "yellow" : "red",
      top_strengths: bestMoments,
      top_corrections: missedMoments.length > 0 ? missedMoments : ["Push the employee to stay specific under pressure."],
      whether_live_shadowing_is_needed: overallScore < 60,
      whether_manager_follow_up_is_needed: overallScore < 75,
      recommended_follow_up_action: overallScore < 75 ? `Assign another drill in the same family with emphasis on ${priorityProfile.primary.join(", ")}.` : "Advance to the next difficulty.",
      recommended_next_drill: params.scenarioJson.scenario_family,
    }),
  };
}

function buildLocalProfileUpdate(params: { currentProfile: any; sessionBundle: any }): ProfileUpdateResult {
  const evaluation = params.sessionBundle?.evaluation || {};
  const overallScore = typeof evaluation.overall_score === "number" ? evaluation.overall_score : 65;
  const categoryScores = evaluation.category_scores || {};

  return profileUpdateResultSchema.parse({
    level_estimate: overallScore >= 85 ? "L4" : overallScore >= 75 ? "L3" : overallScore >= 60 ? "L2" : "L1",
    readiness_status: evaluation.readiness_signal || "practice_more",
    trend: overallScore >= ((params.currentProfile?.average_score as number | undefined) ?? 65) ? "improving" : "flat",
    skill_map: {
      empathy: clampScore(categoryScores.listening_empathy ?? 6),
      clarity: clampScore(categoryScores.clarity_directness ?? 6),
      policy_accuracy: clampScore(categoryScores.policy_accuracy ?? 6),
      ownership: clampScore(categoryScores.ownership ?? 6),
      de_escalation: clampScore(categoryScores.de_escalation ?? 6),
      escalation_judgment: clampScore(categoryScores.escalation_judgment ?? 6),
      professional_presence: clampScore(categoryScores.visible_professionalism ?? 6),
    },
    strongest_scenario_families: [params.sessionBundle?.scenario?.scenario_family].filter(Boolean),
    weakest_scenario_families: overallScore < 70 ? [params.sessionBundle?.scenario?.scenario_family].filter(Boolean) : [],
    pressure_handling: overallScore >= 75 ? "steady" : "needs repetition",
    consistency_score: Math.max(0, Math.min(100, overallScore)),
    recommended_next_steps: ["Run another 3-5 turn scenario and keep the close explicit."],
    manager_attention_flag: overallScore < 60,
  });
}

function buildLocalAdaptiveDifficulty(params: { employeeProfile: any; recentSessions: any[] }): AdaptiveDifficultyResult {
  const recentScores = (params.recentSessions || [])
    .map((session: any) => session?.overallScore)
    .filter((value: unknown) => typeof value === "number") as number[];
  const average = recentScores.length > 0 ? recentScores.reduce((sum, value) => sum + value, 0) / recentScores.length : 65;
  const nextDifficulty = average >= 85 ? 4 : average >= 70 ? 3 : 2;

  return adaptiveDifficultyResultSchema.parse({
    next_difficulty: nextDifficulty,
    difficulty_reason: "Local fallback difficulty recommendation based on recent scores.",
    recommended_scenario_family: params.employeeProfile?.weakestFamilies?.[0] || "",
    recommended_emotional_intensity: nextDifficulty >= 4 ? "high" : "moderate",
    recommended_complexity: nextDifficulty >= 4 ? "ambiguous" : "mixed",
  });
}

function buildFailureBundle(params: {
  processingStatus: "invalid" | "reprocess";
  failure: PipelineFailure;
  policyContext: string;
  policyGrounding?: Partial<PolicyGroundingResult>;
  visibleBehavior?: Partial<VisibleBehaviorResult>;
  sessionQuality?: Partial<SessionQualityResult>;
}): EvaluationPipelineResult {
  const policyGrounding = policyGroundingResultSchema.parse({
    policy_accuracy: "not_evaluated",
    matched_policy_points: [],
    missed_policy_points: [],
    invented_or_risky_statements: [],
    should_have_escalated: false,
    policy_notes: params.failure.message,
    ...params.policyGrounding,
  });

  const visibleBehavior = visibleBehaviorResultSchema.parse({
    assessment_status: params.processingStatus === "reprocess" ? "invalid_media" : "not_available",
    usable_for_scoring: false,
    flags: [params.failure.code],
    summary: params.failure.message,
    retry_recommended: params.failure.retryable,
    ...params.visibleBehavior,
  });

  const sessionQuality = sessionQualityResultSchema.parse({
    session_quality: params.processingStatus === "invalid" ? "invalid" : "questionable",
    flags: [params.failure.code],
    reason: params.failure.message,
    retry_recommended: params.failure.retryable,
    ...params.sessionQuality,
  });

  const evaluation = evaluationResultSchema.parse({
    overall_score: 0,
    pass_fail: "fail",
    readiness_signal: "practice_more",
    category_scores: DEFAULT_CATEGORY_SCORES,
    best_moments: [],
    missed_moments: [params.failure.message],
    critical_mistakes: [params.failure.code],
    coachable_mistakes: [],
    most_important_correction: "Retry the session with a complete, valid recording.",
    ideal_response_example: "A full session is required before the system can generate a reliable ideal response.",
    summary: params.failure.message,
  });

  const coaching = coachingResultSchema.parse({
    employee_coaching_summary: "This run is not coachable yet. The session capture was incomplete or unreliable.",
    what_you_did_well: [],
    what_hurt_you: [params.failure.message],
    do_this_next_time: [
      "Repeat the scenario with a complete 3-5 turn interaction.",
      "Make sure transcript or media capture is working before you begin again.",
    ],
    replacement_phrases: ["Let me restart and handle that from the top."],
    practice_focus: "session_reliability",
    next_recommended_scenario: "repeat_current_scenario",
  });

  const managerDebrief = managerDebriefResultSchema.parse({
    manager_summary: "Do not coach or override this run yet. Reprocess or repeat the session after fixing the capture issue.",
    performance_signal: "red",
    top_strengths: [],
    top_corrections: ["Reprocess the session before using it for coaching or scoring."],
    whether_live_shadowing_is_needed: false,
    whether_manager_follow_up_is_needed: true,
    recommended_follow_up_action: "Reprocess or repeat the session after fixing the transcript/media issue.",
    recommended_next_drill: "repeat_current_scenario",
  });

  return {
    processingStatus: params.processingStatus,
    failure: params.failure,
    policyGrounding,
    visibleBehavior,
    sessionQuality,
    evaluation,
    coaching,
    managerDebrief,
    policyContext: params.policyContext,
  };
}

async function retrievePolicyContext(params: {
  department?: string;
  scenarioFamily?: string;
  scenarioTitle?: string;
  situationSummary?: string;
  openingLine?: string;
  requiredBehaviors?: string[];
  criticalErrors?: string[];
}) {
  const db = await getDb();
  if (!db) return WSC_POLICY_CONTEXT;

  const activePolicies = await db.select({
    title: policyDocuments.title,
    department: policyDocuments.department,
    scenarioFamilies: policyDocuments.scenarioFamilies,
    content: policyDocuments.content,
  })
    .from(policyDocuments)
    .where(and(
      eq(policyDocuments.isActive, true),
      params.department ? or(eq(policyDocuments.department, params.department as any), isNull(policyDocuments.department)) : eq(policyDocuments.isActive, true),
    ));

  const selected = selectRelevantPolicies(activePolicies, {
    department: params.department,
    scenarioFamily: params.scenarioFamily,
    scenarioTitle: params.scenarioTitle,
    situationSummary: params.situationSummary,
    openingLine: params.openingLine,
    requiredBehaviors: params.requiredBehaviors,
    criticalErrors: params.criticalErrors,
  });

  if (selected.length === 0) return WSC_POLICY_CONTEXT;

  return [WSC_POLICY_CONTEXT, ...selected
    .map(policy => `Policy: ${policy.title}\n${policy.content}`)]
    .join("\n\n");
}

function assessTranscript(transcriptInput: unknown): { transcript?: TranscriptTurn[]; failure?: PipelineFailure } {
  const parsed = transcriptSchema.safeParse(transcriptInput);
  if (!parsed.success) {
    return {
      failure: {
        code: "transcript_failure",
        stage: "transcript_validation",
        message: "Transcript is missing or malformed. The session cannot be scored reliably.",
        retryable: true,
      },
    };
  }

  const transcript = parsed.data;
  const employeeTurns = transcript.filter(turn => turn.role === "employee");
  const customerTurns = transcript.filter(turn => turn.role === "customer");

  if (employeeTurns.length === 0 || customerTurns.length === 0) {
    return {
      failure: {
        code: "transcript_failure",
        stage: "transcript_validation",
        message: "Transcript did not capture both sides of the interaction.",
        retryable: true,
      },
    };
  }

  if (transcript.length < 3 || employeeTurns.length < 2) {
    return {
      transcript,
      failure: {
        code: "incomplete_session",
        stage: "session_completeness",
        message: "Session ended before enough turns were captured to score it confidently.",
        retryable: true,
      },
    };
  }

  return { transcript };
}

function assessMedia(mediaInput: unknown): { media: MediaInput[]; visibleBehavior: VisibleBehaviorResult; failure?: PipelineFailure } {
  if (!Array.isArray(mediaInput) || mediaInput.length === 0) {
    return {
      media: [],
      visibleBehavior: visibleBehaviorResultSchema.parse({
        assessment_status: "not_available",
        usable_for_scoring: false,
        flags: ["no_media"],
        summary: "No session media was provided. Visible behavior was not scored.",
        retry_recommended: false,
      }),
    };
  }

  const parsed = mediaInputSchema.array().safeParse(mediaInput);
  if (!parsed.success) {
    return {
      media: [],
      visibleBehavior: visibleBehaviorResultSchema.parse({
        assessment_status: "invalid_media",
        usable_for_scoring: false,
        flags: ["invalid_media"],
        summary: "Session media metadata is malformed or incomplete.",
        retry_recommended: true,
      }),
      failure: {
        code: "invalid_media",
        stage: "media_validation",
        message: "Session media metadata is malformed or incomplete.",
        retryable: true,
      },
    };
  }

  const media = parsed.data;
  const invalidItem = media.find(item => {
    if (!item.storageUrl) return true;
    if ((item.mediaType === "video" || item.mediaType === "audio") && (item.durationSeconds ?? 0) <= 0) return true;
    return false;
  });

  if (invalidItem) {
    return {
      media,
      visibleBehavior: visibleBehaviorResultSchema.parse({
        assessment_status: "invalid_media",
        usable_for_scoring: false,
        flags: ["invalid_media"],
        summary: `Media item ${invalidItem.mediaType} is missing required metadata for scoring.`,
        retry_recommended: true,
      }),
      failure: {
        code: "invalid_media",
        stage: "media_validation",
        message: "Session media is invalid and needs reprocessing before visible behavior can be scored.",
        retryable: true,
      },
    };
  }

  return {
    media,
    visibleBehavior: visibleBehaviorResultSchema.parse({
      assessment_status: "not_available",
      usable_for_scoring: false,
      flags: ["behavior_scoring_pending"],
      summary: "Media is valid, but visible behavior scoring is reserved for a future multimodal pipeline.",
      retry_recommended: false,
    }),
  };
}

function mapPromptErrorToFailure(error: PromptExecutionError): PipelineFailure {
  return {
    code: error.code === "malformed_json" ? "malformed_json" : "llm_failure",
    stage: "prompt_execution",
    message: error.code === "malformed_json"
      ? `Structured output from ${error.promptName} was malformed and needs reprocessing.`
      : `Prompt ${error.promptName} failed before scoring could complete.`,
    retryable: true,
    promptName: error.promptName,
    promptVersion: error.promptVersion,
  };
}

export async function generateScenario(params: {
  department: string;
  employeeRole: string;
  difficulty: number;
  mode: string;
  scenarioFamily?: string;
  employeeLevelEstimate?: string;
}): Promise<ScenarioDirectorResult> {
  const departmentKey = (params.department in scenarioFamiliesByDepartment
    ? params.department
    : "customer_service") as keyof typeof scenarioFamiliesByDepartment;
  const supportedFamilies = scenarioFamiliesByDepartment[departmentKey]
    .map((family) => familyLabels[family] || family)
    .join(", ");
  const policyContext = await retrievePolicyContext({
    department: departmentKey,
    scenarioFamily: params.scenarioFamily,
  });
  const prompt = `Build 1 advanced WSC scenario.
Inputs:
Department: ${departmentLabels[departmentKey]}
Employee role: ${params.employeeRole}
Difficulty: ${params.difficulty}
Mode: ${params.mode}
Scenario family: ${params.scenarioFamily || `pick one realistic option from this department only: ${supportedFamilies}`}
Employee level estimate: ${params.employeeLevelEstimate || "unknown"}

Requirements:
- Keep it specific to Woodinville Sports Club.
- Use only the current role track for the department.
- Keep it trainable in 3-5 turns.
- Avoid generic retail, hotel, or call-center situations.

Approved policy context:
${policyContext}

Return the full scenario JSON with branch_logic, emotion_progression, and completion_rules.`;

  const scenario = scenarioDirectorResultSchema.parse(await runPrompt(AI_SERVICE_REGISTRY.scenarioDirector, prompt));
  return scenarioDirectorResultSchema.parse({
    ...scenario,
    recommended_turns: clampRecommendedTurns(scenario.recommended_turns),
  });
}

export async function processEmployeeTurn(params: {
  scenarioJson: unknown;
  stateJson?: unknown;
  transcript: Array<{ role: string; message: string; emotion?: string }>;
  employeeResponse: string;
}): Promise<{ customerReply: CustomerReplyResult; stateUpdate: StateUpdateResult }> {
  const transcript = transcriptSchema.parse(params.transcript);
  const parsedScenario = scenarioDirectorResultSchema.parse(params.scenarioJson);
  const parsedPriorState = stateUpdateResultSchema.partial().safeParse(params.stateJson).success
    ? (params.stateJson as Partial<StateUpdateResult>)
    : undefined;
  const score = scoreEmployeeMessage(params.employeeResponse);
  const objectiveProgress = assessGoalProgress({
    scenario: parsedScenario,
    transcript,
    employeeResponse: params.employeeResponse,
    score,
  });

  if (!ENV.forgeApiKey) {
    return buildLocalTurnResponse({
      scenario: parsedScenario,
      transcript,
      priorState: parsedPriorState,
      employeeResponse: params.employeeResponse,
    });
  }

  const transcriptText = formatTranscript(transcript);
  const priorState = parsedPriorState;
  const defaultState = {
    turn_number: 1,
    emotion_state: (params.scenarioJson as any)?.emotion_progression?.starting_state || "frustrated",
    trust_level: 3,
    issue_clarity: 3,
    employee_flags: {
      showed_empathy: false,
      answered_directly: false,
      used_correct_policy: false,
      took_ownership: false,
      avoided_question: false,
      critical_error: false,
    },
    escalation_required: false,
    scenario_risk_level: "moderate",
    continue_simulation: true,
  };

  const customerPrompt = `Scenario:\n${JSON.stringify(parsedScenario, null, 2)}\n\nConversation state:\n${JSON.stringify(priorState || defaultState, null, 2)}\n\nTranscript so far:\n${transcriptText}\n\nOperational goal:\n${objectiveProgress.goal.title}\n${objectiveProgress.goal.description}\n\nResponse progress analysis:\n${objectiveProgress.progressSummary}\nNext missing objective: ${objectiveProgress.nextMissing || "none"}\nCompleted this turn: ${objectiveProgress.completedThisTurn.join(", ") || "none"}\n\nLatest employee response:\n${params.employeeResponse}\n\nInstruction: Acknowledge meaningful progress naturally, then ask only for the next missing thing if the issue is not resolved. Do not repeat an old ask once the employee has already handled it.`;
  const customerReply = await runPrompt(AI_SERVICE_REGISTRY.statefulCustomerActor, customerPrompt);

  const statePrompt = `Previous state:\n${JSON.stringify(priorState || defaultState, null, 2)}\n\nScenario:\n${JSON.stringify(parsedScenario, null, 2)}\n\nOperational goal progress:\n${objectiveProgress.progressSummary}\nNext missing objective: ${objectiveProgress.nextMissing || "none"}\n\nLatest employee turn:\n${params.employeeResponse}\n\nLatest customer turn:\n${JSON.stringify(customerReply, null, 2)}`;
  const stateUpdate = await runPrompt(AI_SERVICE_REGISTRY.conversationStateUpdater, statePrompt);

  return {
    customerReply: customerReplyResultSchema.parse(customerReply),
    stateUpdate: stateUpdateResultSchema.parse(stateUpdate),
  };
}

export async function runPostSessionEvaluation(params: {
  scenarioJson: any;
  transcript: unknown;
  stateHistory: unknown;
  employeeName?: string;
  employeeRole: string;
  policyContext?: string;
  media?: unknown;
}): Promise<EvaluationPipelineResult> {
  const parsedScenario = scenarioDirectorResultSchema.parse(params.scenarioJson);
  const policyContext = params.policyContext
    || await retrievePolicyContext({
      department: parsedScenario.department,
      scenarioFamily: parsedScenario.scenario_family,
      scenarioTitle: parsedScenario.scenario_id,
      situationSummary: parsedScenario.situation_summary,
      openingLine: parsedScenario.opening_line,
      requiredBehaviors: parsedScenario.required_behaviors,
      criticalErrors: parsedScenario.critical_errors,
    });

  const transcriptAssessment = assessTranscript(params.transcript);
  if (transcriptAssessment.failure) {
    return buildFailureBundle({
      processingStatus: transcriptAssessment.failure.code === "incomplete_session" ? "reprocess" : "invalid",
      failure: transcriptAssessment.failure,
      policyContext,
    });
  }
  const transcript = transcriptAssessment.transcript!;

  const parsedStateHistory = stateHistorySchema.safeParse(params.stateHistory);
  const stateHistory = parsedStateHistory.success ? parsedStateHistory.data : [];

  const mediaAssessment = assessMedia(params.media);
  if (mediaAssessment.failure) {
    return buildFailureBundle({
      processingStatus: "reprocess",
      failure: mediaAssessment.failure,
      policyContext,
      visibleBehavior: mediaAssessment.visibleBehavior,
    });
  }

  if (!ENV.forgeApiKey) {
    return buildLocalEvaluation({
      scenarioJson: parsedScenario,
      transcript,
      policyContext,
    });
  }

  const transcriptText = formatTranscript(transcript);
  const employeeResponses = transcript
    .filter(turn => turn.role === "employee")
    .map(turn => turn.message)
    .join("\n\n");

  try {
    const policyGrounding = await runPrompt(
      AI_SERVICE_REGISTRY.policyGrounding,
      `Scenario:\n${JSON.stringify(params.scenarioJson, null, 2)}\n\nApproved policy context:\n${policyContext}\n\nEmployee response:\n${employeeResponses}`,
    );

    const sessionQuality = await runPrompt(
      AI_SERVICE_REGISTRY.lowEffortDetector,
      `Transcript:\n${transcriptText}\n\nState history:\n${JSON.stringify(stateHistory, null, 2)}\n\nVisible behavior summary:\n${mediaAssessment.visibleBehavior.summary}`,
    );

    const evaluation = await runPrompt(
      AI_SERVICE_REGISTRY.interactionEvaluator,
      `Scenario:\n${JSON.stringify(params.scenarioJson, null, 2)}\n\nTranscript:\n${transcriptText}\n\nConversation state history:\n${JSON.stringify(stateHistory, null, 2)}\n\nPolicy grounding:\n${JSON.stringify(policyGrounding, null, 2)}\n\nVisible behavior:\n${JSON.stringify(mediaAssessment.visibleBehavior, null, 2)}`,
    );

    const coaching = await runPrompt(
      AI_SERVICE_REGISTRY.coachingGenerator,
      `Scenario:\n${JSON.stringify(params.scenarioJson, null, 2)}\n\nEvaluation:\n${JSON.stringify(evaluation, null, 2)}`,
    );

    const managerDebrief = await runPrompt(
      AI_SERVICE_REGISTRY.managerDebriefGenerator,
      `Employee name: ${params.employeeName || "Training Employee"}\nRole: ${params.employeeRole}\nScenario: ${JSON.stringify(params.scenarioJson, null, 2)}\nEvaluation: ${JSON.stringify(evaluation, null, 2)}\nCoaching: ${JSON.stringify(coaching, null, 2)}`,
    );

    const validatedPolicyGrounding = policyGroundingResultSchema.parse(policyGrounding);
    const validatedSessionQuality = sessionQualityResultSchema.parse(sessionQuality);
    const validatedEvaluation = evaluationResultSchema.parse(evaluation);
    const validatedCoaching = coachingResultSchema.parse(coaching);
    const validatedManagerDebrief = managerDebriefResultSchema.parse(managerDebrief);
    const processingStatus = validatedSessionQuality.retry_recommended || validatedSessionQuality.session_quality === "invalid"
      ? "reprocess"
      : "completed";

    const failure = processingStatus === "reprocess"
      ? {
        code: "reprocess_required" as const,
        stage: "quality_gate",
        message: validatedSessionQuality.reason || "Session quality gate requested reprocessing.",
        retryable: true,
      }
      : undefined;

    return {
      processingStatus,
      failure,
      policyGrounding: validatedPolicyGrounding,
      visibleBehavior: mediaAssessment.visibleBehavior,
      sessionQuality: validatedSessionQuality,
      evaluation: validatedEvaluation,
      coaching: validatedCoaching,
      managerDebrief: validatedManagerDebrief,
      policyContext,
    };
  } catch (error) {
    if (error instanceof PromptExecutionError) {
      return buildFailureBundle({
        processingStatus: "reprocess",
        failure: mapPromptErrorToFailure(error),
        policyContext,
        visibleBehavior: mediaAssessment.visibleBehavior,
      });
    }
    throw error;
  }
}

export async function updateEmployeeProfile(params: {
  currentProfile: any;
  sessionBundle: any;
}): Promise<ProfileUpdateResult> {
  if (!ENV.forgeApiKey) {
    return buildLocalProfileUpdate(params);
  }

  const prompt = `Current employee profile:\n${JSON.stringify(params.currentProfile, null, 2)}\n\nLatest session:\n${JSON.stringify(params.sessionBundle, null, 2)}`;
  const result = await runPrompt(AI_SERVICE_REGISTRY.employeeProfileUpdater, prompt, {
    systemPrompt: EMPLOYEE_PROFILE_UPDATER_SYSTEM,
    validator: profileUpdateResultSchema,
  });
  return profileUpdateResultSchema.parse(result);
}

export async function getAdaptiveDifficulty(params: {
  employeeProfile: any;
  recentSessions: any[];
}): Promise<AdaptiveDifficultyResult> {
  if (!ENV.forgeApiKey) {
    return buildLocalAdaptiveDifficulty(params);
  }

  const prompt = `Employee profile:\n${JSON.stringify(params.employeeProfile || { level_estimate: "unknown", sessions_completed: 0 }, null, 2)}\n\nRecent session history:\n${JSON.stringify(params.recentSessions || [], null, 2)}`;
  const result = await runPrompt(AI_SERVICE_REGISTRY.adaptiveDifficultyEngine, prompt, {
    validator: adaptiveDifficultyResultSchema,
  });
  return adaptiveDifficultyResultSchema.parse(result);
}
