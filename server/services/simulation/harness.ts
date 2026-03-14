import type { ScenarioDirectorResult, StateUpdateResult, TranscriptTurn } from "../ai/contracts";
import { deriveScenarioHumanContext } from "../../../shared/wsc-content";
import { analyzeEmployeeUtterance } from "./analysis";
import { buildNegativeCustomerReaction } from "./emotion";
import { buildDefaultConversationState, simulateCustomerTurn } from "./engine";
import type {
  EmployeeUtteranceAnalysis,
  LikelyNextCustomerBehavior,
  ServiceFailureLevel,
  SimulationStateDraft,
} from "./types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeReply(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTokens(text: string, count = 5) {
  return normalizeReply(text).split(" ").filter(Boolean).slice(0, count).join(" ");
}

function deriveFrustrationEstimate(state: Pick<SimulationStateDraft, "offense_level" | "patience_level" | "trust_level" | "goal_status" | "urgency_level">) {
  const blockedPenalty = state.goal_status === "ACTIVE" || state.goal_status === "PARTIALLY_RESOLVED" ? 2 : 0;
  const trustPenalty = state.trust_level <= 3 ? 2 : state.trust_level <= 5 ? 1 : 0;
  return clamp((state.offense_level * 0.5) + ((10 - state.patience_level) * 0.3) + (state.urgency_level * 0.1) + blockedPenalty + trustPenalty);
}

function detectRepetitionRisk(reply: string, priorReplies: string[]) {
  const normalized = normalizeReply(reply);
  const prefix = firstTokens(reply);
  const priorNormalized = priorReplies.map(normalizeReply);
  const priorPrefixes = priorReplies.map((item) => firstTokens(item));

  if (priorNormalized.includes(normalized)) return 9;
  if (priorPrefixes.includes(prefix) && prefix.length > 0) return 6;
  return 1;
}

function derivePersonaAlignmentScore(scenario: ScenarioDirectorResult, turns: HarnessReplayTurn[]) {
  const style = scenario.customer_persona.communication_style.toLowerCase();
  const averageWords = average(turns.map((turn) => normalizeReply(turn.customerReply).split(" ").filter(Boolean).length));
  const questionRate = average(turns.map((turn) => (turn.customerReply.includes("?") ? 1 : 0))) * 10;

  let score = 7;

  if (style.includes("direct") && averageWords <= 18) score += 1;
  if (style.includes("organized") && questionRate >= 4) score += 1;
  if (style.includes("skeptical") && turns.some((turn) => turn.likelyNextBehavior === "become_cautious")) score += 1;
  if (style.includes("warm") && turns.some((turn) => turn.emotionState === "reassured" || turn.emotionState === "calmer")) score += 1;
  if (style.includes("urgent") && turns.some((turn) => turn.likelyNextBehavior === "follow_instructions" || turn.customerReply.toLowerCase().includes("right now"))) score += 1;

  if (style.includes("direct") && averageWords > 28) score -= 2;
  if (style.includes("warm") && turns.some((turn) => turn.serviceFailureLevel === "mild" && turn.customerReply.toLowerCase().includes("manager"))) score -= 2;

  return clamp(score);
}

function deriveScenarioAlignmentScore(scenario: ScenarioDirectorResult, turns: HarnessReplayTurn[]) {
  const replies = turns.map((turn) => turn.customerReply.toLowerCase()).join(" ");
  const scoreBoosts: string[] = [];
  const penalties: string[] = [];

  const scoreKeywordsByFamily: Record<string, string[]> = {
    billing_confusion: ["checking", "charge", "pending", "final", "doing right now", "next step"],
    cancellation_request: ["cancel", "when", "charge", "effective", "next step"],
    reservation_issue: ["reservation", "booking", "confirm", "what happened", "next step"],
    upset_parent: ["my child", "what happened", "right now", "manager"],
    wrong_information: ["who told me", "what is correct", "so what actually"],
    refund_request: ["refund", "credit", "how long", "what happens next"],
    membership_question: ["membership", "what is included", "how does that work"],
  };
  const crossScenarioMismatchKeywords = {
    billing_confusion: ["911", "ems", "range", "tee time"],
    cancellation_request: ["911", "ems", "range"],
    refund_request: ["911", "ems", "range"],
  };

  const expectedKeywords = scoreKeywordsByFamily[scenario.scenario_family] || [];
  if (expectedKeywords.some((keyword) => replies.includes(keyword))) scoreBoosts.push("customer stayed on scenario-relevant topics");
  else penalties.push("customer replies were not strongly tied to the scenario facts");

  const mismatches = crossScenarioMismatchKeywords[scenario.scenario_family as keyof typeof crossScenarioMismatchKeywords] || [];
  if (mismatches.some((keyword) => replies.includes(keyword))) penalties.push("customer drifted into unrelated scenario vocabulary");

  return {
    score: clamp(7 + scoreBoosts.length - (penalties.length * 2)),
    notes: [...scoreBoosts, ...penalties],
  };
}

function buildRealismNotes(turns: HarnessReplayTurn[]) {
  const notes: string[] = [];
  const flags: string[] = [];

  const repeatedTurns = turns.filter((turn) => turn.repetitionRisk >= 6).length;
  if (repeatedTurns > 0) {
    flags.push(`${repeatedTurns} turn(s) showed medium or high phrase repetition`);
  } else {
    notes.push("No meaningful response repetition detected.");
  }

  if (turns.some((turn) => turn.customerReply.toLowerCase().includes("as an ai") || turn.customerReply.toLowerCase().includes("training"))) {
    flags.push("Customer reply broke realism with meta language.");
  } else {
    notes.push("No meta or assistant-style language detected.");
  }

  return { notes, flags };
}

function evaluateVariantRealism(params: {
  scenario: ScenarioDirectorResult;
  variant: HarnessVariant;
  turns: HarnessReplayTurn[];
}) {
  const { scenario, variant, turns } = params;
  const trustDeltas = turns.map((turn) => turn.trustDelta);
  const escalationValues = turns.map((turn) => turn.managerRequestLevel);
  const serviceFailures = turns.map((turn) => turn.serviceFailureLevel);
  const repetitionScore = clamp(10 - average(turns.map((turn) => turn.repetitionRisk)));
  const { score: scenarioAlignment, notes: scenarioNotes } = deriveScenarioAlignmentScore(scenario, turns);
  const personaAlignment = derivePersonaAlignmentScore(scenario, turns);

  let emotionalConsistency = 8;
  let trustConsistency = 8;
  let escalationAppropriateness = 8;
  const notes: string[] = [];
  const flags: string[] = [];

  turns.forEach((turn) => {
    if (turn.employeeAnalysis.helpfulness >= 7 && turn.trustDelta < 0) {
      trustConsistency -= 2;
      notes.push(`Turn ${turn.turnNumber}: trust fell despite clearly helpful service.`);
    }
    if ((turn.employeeAnalysis.explicitDisrespect || turn.employeeAnalysis.soundedRude) && turn.frustrationDelta <= 0) {
      emotionalConsistency -= 2;
      notes.push(`Turn ${turn.turnNumber}: frustration did not rise after rude service.`);
    }
    if (turn.employeeAnalysis.fakeConfidence && turn.trustDelta >= 0) {
      trustConsistency -= 2;
      notes.push(`Turn ${turn.turnNumber}: fake confidence did not reduce trust.`);
    }
    if (turn.employeeAnalysis.contradictionDetected && !["confused", "guarded", "become_cautious"].some((marker) => turn.emotionState === marker || turn.likelyNextBehavior === marker)) {
      emotionalConsistency -= 1;
      notes.push(`Turn ${turn.turnNumber}: contradiction did not produce confusion or caution.`);
    }
  });

  if (variant.id === "good-response" && Math.max(...escalationValues) >= 6) {
    escalationAppropriateness -= 3;
    flags.push("Good service path escalated too quickly.");
  }
  if (["rude-response", "incorrect-policy-response"].includes(variant.id) && Math.max(...escalationValues) < 4) {
    escalationAppropriateness -= 3;
    flags.push("Severe failure path did not increase manager pressure enough.");
  }
  if (variant.id === "empathetic-unresolved-response" && turns[turns.length - 1]?.goalStatus === "RESOLVED") {
    escalationAppropriateness -= 2;
    flags.push("Empathetic but unresolved path resolved too easily.");
  }
  if (variant.id === "weak-response" && serviceFailures.every((level) => level === "none")) {
    emotionalConsistency -= 2;
    flags.push("Weak service path did not register service failure.");
  }

  const baselineNotes = buildRealismNotes(turns);
  notes.push(...baselineNotes.notes, ...scenarioNotes);
  flags.push(...baselineNotes.flags);

  const overallScore = clamp(average([
    emotionalConsistency,
    trustConsistency,
    escalationAppropriateness,
    repetitionScore,
    personaAlignment,
    scenarioAlignment,
  ]));

  return {
    overallScore,
    emotionalConsistency: clamp(emotionalConsistency),
    trustConsistency: clamp(trustConsistency),
    escalationAppropriateness: clamp(escalationAppropriateness),
    repetitionScore,
    personaAlignment,
    scenarioAlignment,
    notes,
    flags,
  };
}

export interface HarnessVariant {
  id: string;
  label: string;
  description: string;
  employeeResponses: string[];
}

export interface HarnessScenarioCase {
  scenarioId: string;
  title: string;
  scenario: ScenarioDirectorResult;
  openingCustomerMessage?: string;
  variants: HarnessVariant[];
}

export interface HarnessReplayTurn {
  turnNumber: number;
  employeeMessage: string;
  customerReply: string;
  emotionState: string;
  trustLevel: number;
  trustDelta: number;
  frustrationEstimate: number;
  frustrationDelta: number;
  managerRequestLevel: number;
  offenseLevel: number;
  issueClarity: number;
  resolutionConfidence: number;
  likelyNextBehavior: LikelyNextCustomerBehavior;
  customerStrategy: SimulationStateDraft["customer_strategy"];
  goalStatus: SimulationStateDraft["goal_status"];
  scenarioComplete: boolean;
  completionReason: string;
  serviceFailureLevel: ServiceFailureLevel;
  negativeReactionReason: string;
  repetitionRisk: number;
  employeeAnalysis: EmployeeUtteranceAnalysis;
}

export interface HarnessRealismEvaluation {
  overallScore: number;
  emotionalConsistency: number;
  trustConsistency: number;
  escalationAppropriateness: number;
  repetitionScore: number;
  personaAlignment: number;
  scenarioAlignment: number;
  notes: string[];
  flags: string[];
}

export interface HarnessVariantResult {
  scenarioId: string;
  scenarioTitle: string;
  variant: HarnessVariant;
  turns: HarnessReplayTurn[];
  finalState: StateUpdateResult;
  finalTranscript: TranscriptTurn[];
  evaluation: HarnessRealismEvaluation;
}

export interface HarnessDashboard {
  summary: {
    scenariosRun: number;
    variantsRun: number;
    averageOverallScore: number;
    flaggedVariants: number;
    highRepetitionVariants: number;
  };
  cases: Array<{
    scenarioId: string;
    title: string;
    results: HarnessVariantResult[];
  }>;
}

function createScenario(overrides: Partial<ScenarioDirectorResult> = {}): ScenarioDirectorResult {
  const humanContext = deriveScenarioHumanContext({
    department: "customer_service",
    scenario_family: "billing_confusion",
  });
  return {
    scenario_id: "harness-billing-confusion",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Long-time member who watches billing closely",
      communication_style: "direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees two membership-related charges and wants to know what is pending, what is final, and what happens next.",
    opening_line: "I need to know why I was charged twice and what you're doing about it.",
    hidden_facts: ["One charge is pending and one is final."],
    motive: humanContext.motive,
    hidden_context: humanContext.hidden_context,
    personality_style: humanContext.personality_style,
    past_history: humanContext.past_history,
    pressure_context: humanContext.pressure_context,
    friction_points: humanContext.friction_points,
    emotional_triggers: humanContext.emotional_triggers,
    likely_assumptions: humanContext.likely_assumptions,
    what_hearing_them_out_sounds_like: humanContext.what_hearing_them_out_sounds_like,
    credible_next_steps: humanContext.credible_next_steps,
    calm_down_if: humanContext.calm_down_if,
    lose_trust_if: humanContext.lose_trust_if,
    approved_resolution_paths: ["Verify the ledger, explain the pending vs final charge, and give a clear timeline."],
    required_behaviors: ["Show empathy", "Take ownership", "Explain the status clearly", "Give a next step"],
    critical_errors: ["Blame the member", "Guess at billing policy", "Dismiss the concern"],
    branch_logic: {
      if_empathy_is_strong: "Customer becomes easier to help.",
      if_answer_is_vague: "Customer becomes sharper and more skeptical.",
      if_policy_is_wrong: "Customer questions competence and may ask for a manager.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer frustration compounds.",
      if_employee_escalates_correctly: "Customer accepts a handoff if needed.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["Clear answer", "Ownership", "Timeline"],
      worse_if: ["Vague answer", "Dismissive tone", "Wrong policy"],
    },
    completion_rules: {
      resolved_if: ["Customer understands which charge is pending, which is final, and what happens next."],
      end_early_if: ["Employee becomes openly rude or blames the member."],
      manager_required_if: ["Employee gives clearly wrong billing policy or becomes disrespectful."],
    },
    completion_criteria: [
      "customer understands the billing breakdown",
      "employee explains the next step clearly",
      "ownership is shown before closing",
    ],
    failure_criteria: [
      "employee ends the interaction without an outcome",
      "customer remains confused about the core issue",
      "no clear next step is provided",
    ],
    recommended_turns: 4,
    ...overrides,
  };
}

export function buildSampleHarnessMatrix(): HarnessScenarioCase[] {
  return [
    {
      scenarioId: "billing-confusion",
      title: "Billing confusion",
      scenario: createScenario(),
      variants: [
        {
          id: "good-response",
          label: "Good response",
          description: "Clear empathy, ownership, explanation, and timeline.",
          employeeResponses: [
            "I can see why that would be frustrating. I am pulling up your ledger now so I can verify which charge is pending and which one is final.",
            "I confirmed the first charge is your active membership and the second one is still pending, so it has not fully posted.",
            "I am submitting the correction now, and you will have written confirmation this afternoon.",
          ],
        },
        {
          id: "weak-response",
          label: "Weak response",
          description: "Vague and repetitive without real ownership.",
          employeeResponses: [
            "We will look into it and get back to you.",
            "Sometimes billing takes time, so you probably just need to wait.",
            "I do not have anything else for you right now.",
          ],
        },
        {
          id: "rude-response",
          label: "Rude response",
          description: "Dismissive and rude service that should trigger stronger pushback.",
          employeeResponses: [
            "Calm down. It is probably fine and there is no reason to make this a big deal.",
            "I already told you to wait, so I do not know what else you want from me.",
          ],
        },
        {
          id: "incorrect-policy-response",
          label: "Incorrect policy response",
          description: "Confidently wrong policy explanation that should reduce trust quickly.",
          employeeResponses: [
            "Once a pending charge shows up, it is always final. That is just our policy.",
            "We cannot reverse anything that appears on the account, so there is nothing to review.",
          ],
        },
        {
          id: "empathetic-unresolved-response",
          label: "Empathetic but unresolved response",
          description: "Empathy and ownership are present, but resolution is still incomplete.",
          employeeResponses: [
            "I can see why this feels frustrating, and I want to help you without giving you the wrong answer.",
            "I still need to verify this with billing before I tell you whether the second charge will fall off.",
            "I do not have the final answer yet, but I will update you by 4 p.m. today.",
          ],
        },
      ],
    },
    {
      scenarioId: "wrong-information",
      title: "Wrong information from a prior employee",
      scenario: createScenario({
        scenario_id: "harness-wrong-information",
        scenario_family: "wrong_information",
        situation_summary: "A member says a prior employee told them the wrong thing, and they want the front desk to fix the confusion without blaming anyone.",
        opening_line: "Yesterday someone told me my guest passes would cover this, and now you are telling me something different.",
        hidden_facts: ["The prior employee misunderstood the guest pass policy."],
        approved_resolution_paths: ["Acknowledge the confusion, clarify the correct rule, and own the next step without blaming the prior employee."],
        required_behaviors: ["Acknowledge the conflict", "Clarify the correct policy", "Avoid blaming staff", "Give a next step"],
      }),
      variants: [
        {
          id: "good-response",
          label: "Good response",
          description: "Clarifies the conflict respectfully and owns the correction.",
          employeeResponses: [
            "I can understand why that would be frustrating. Let me clear up what applies here and take ownership of the next step with you.",
            "The correct guest pass rule does not cover this program, but I can explain the difference clearly.",
            "Here is what I can do right now, and if you want I can also bring in a manager to make sure we handle it cleanly.",
          ],
        },
        {
          id: "weak-response",
          label: "Weak response",
          description: "Acknowledges very little and stays vague.",
          employeeResponses: [
            "Someone probably just got mixed up.",
            "That is just how it works sometimes.",
            "You will need to check back later.",
          ],
        },
        {
          id: "rude-response",
          label: "Rude response",
          description: "Blames the customer and dismisses the concern.",
          employeeResponses: [
            "Well, you should have checked before coming in.",
            "I am not going back and forth on this with you.",
          ],
        },
        {
          id: "incorrect-policy-response",
          label: "Incorrect policy response",
          description: "Confidently states the wrong rule and refuses review.",
          employeeResponses: [
            "Guest passes cover every add-on program automatically. That is the rule.",
            "If someone told you otherwise, they were wrong, but I am not checking anything else.",
          ],
        },
        {
          id: "empathetic-unresolved-response",
          label: "Empathetic but unresolved response",
          description: "Shows care but still needs confirmation.",
          employeeResponses: [
            "I can see why this is confusing, and I do not want to make it worse by guessing.",
            "I still need to confirm the exact guest pass rule for this program before I lock in an answer.",
            "I will verify it and give you a clear update today.",
          ],
        },
      ],
    },
  ];
}

export function replayScenarioVariant(params: {
  scenarioCase: HarnessScenarioCase;
  variant: HarnessVariant;
}): HarnessVariantResult {
  const scenario = params.scenarioCase.scenario;
  let transcript: TranscriptTurn[] = [{
    role: "customer",
    message: params.scenarioCase.openingCustomerMessage || scenario.opening_line,
    emotion: scenario.customer_persona.initial_emotion,
  }];
  let priorState = buildDefaultConversationState(scenario);
  const turns: HarnessReplayTurn[] = [];
  const priorReplies: string[] = [];

  params.variant.employeeResponses.forEach((employeeMessage, index) => {
    const result = simulateCustomerTurn({
      scenario,
      transcript,
      priorState,
      employeeResponse: employeeMessage,
    });
    const negativeReaction = buildNegativeCustomerReaction({
      scenario,
      priorState: priorState as SimulationStateDraft,
      state: result.stateUpdate as SimulationStateDraft,
      analysis: result.promptContext.employeeAnalysis,
      recentConversationHistory: transcript,
    });
    const frustrationEstimate = deriveFrustrationEstimate(result.stateUpdate);
    const priorFrustration = deriveFrustrationEstimate(priorState);

    turns.push({
      turnNumber: index + 1,
      employeeMessage,
      customerReply: result.customerReply.customer_reply,
      emotionState: result.stateUpdate.emotion_state,
      trustLevel: result.stateUpdate.trust_level,
      trustDelta: result.stateUpdate.trust_level - priorState.trust_level,
      frustrationEstimate,
      frustrationDelta: frustrationEstimate - priorFrustration,
      managerRequestLevel: result.stateUpdate.manager_request_level,
      offenseLevel: result.stateUpdate.offense_level,
      issueClarity: result.stateUpdate.issue_clarity,
      resolutionConfidence: result.stateUpdate.resolution_confidence,
      likelyNextBehavior: result.stateUpdate.likely_next_behavior,
      customerStrategy: result.stateUpdate.customer_strategy,
      goalStatus: result.stateUpdate.goal_status,
      scenarioComplete: result.customerReply.scenario_complete,
      completionReason: result.customerReply.completion_reason,
      serviceFailureLevel: negativeReaction.failureLevel,
      negativeReactionReason: negativeReaction.reason,
      repetitionRisk: detectRepetitionRisk(result.customerReply.customer_reply, priorReplies),
      employeeAnalysis: result.promptContext.employeeAnalysis,
    });

    transcript = [
      ...transcript,
      { role: "employee", message: employeeMessage },
      {
        role: "customer",
        message: result.customerReply.customer_reply,
        emotion: result.stateUpdate.emotion_state,
      },
    ];
    priorState = result.stateUpdate;
    priorReplies.push(result.customerReply.customer_reply);
  });

  return {
    scenarioId: params.scenarioCase.scenarioId,
    scenarioTitle: params.scenarioCase.title,
    variant: params.variant,
    turns,
    finalState: priorState,
    finalTranscript: transcript,
    evaluation: evaluateVariantRealism({
      scenario,
      variant: params.variant,
      turns,
    }),
  };
}

export function runHarnessMatrix(cases = buildSampleHarnessMatrix()): HarnessDashboard {
  const caseResults = cases.map((scenarioCase) => ({
    scenarioId: scenarioCase.scenarioId,
    title: scenarioCase.title,
    results: scenarioCase.variants.map((variant) => replayScenarioVariant({ scenarioCase, variant })),
  }));

  const allResults = caseResults.flatMap((item) => item.results);

  return {
    summary: {
      scenariosRun: caseResults.length,
      variantsRun: allResults.length,
      averageOverallScore: clamp(average(allResults.map((result) => result.evaluation.overallScore))),
      flaggedVariants: allResults.filter((result) => result.evaluation.flags.length > 0).length,
      highRepetitionVariants: allResults.filter((result) => result.evaluation.repetitionScore <= 5).length,
    },
    cases: caseResults,
  };
}

function formatTurn(turn: HarnessReplayTurn) {
  return [
    `    Turn ${turn.turnNumber}: trust ${turn.trustLevel} (${turn.trustDelta >= 0 ? "+" : ""}${turn.trustDelta})`,
    `frustration ${turn.frustrationEstimate} (${turn.frustrationDelta >= 0 ? "+" : ""}${turn.frustrationDelta})`,
    `manager ${turn.managerRequestLevel}`,
    `behavior ${turn.likelyNextBehavior}`,
    `failure ${turn.serviceFailureLevel}`,
  ].join(" | ");
}

export function formatHarnessDashboard(dashboard: HarnessDashboard) {
  const lines: string[] = [];
  lines.push("Customer Simulation Harness");
  lines.push("==========================");
  lines.push(`Scenarios: ${dashboard.summary.scenariosRun}`);
  lines.push(`Variants: ${dashboard.summary.variantsRun}`);
  lines.push(`Average realism score: ${dashboard.summary.averageOverallScore}/10`);
  lines.push(`Flagged variants: ${dashboard.summary.flaggedVariants}`);
  lines.push(`High repetition variants: ${dashboard.summary.highRepetitionVariants}`);
  lines.push("");

  dashboard.cases.forEach((scenarioCase) => {
    lines.push(`${scenarioCase.title} (${scenarioCase.scenarioId})`);
    lines.push("-".repeat(Math.max(24, scenarioCase.title.length + scenarioCase.scenarioId.length + 3)));

    scenarioCase.results.forEach((result) => {
      lines.push(`  ${result.variant.label}: ${result.evaluation.overallScore}/10`);
      lines.push(`    Final emotion: ${result.finalState.emotion_state}`);
      lines.push(`    Final trust: ${result.finalState.trust_level}`);
      lines.push(`    Final manager pressure: ${result.finalState.manager_request_level}`);
      lines.push(`    Repetition score: ${result.evaluation.repetitionScore}/10`);
      result.turns.forEach((turn) => lines.push(formatTurn(turn)));
      result.evaluation.flags.forEach((flag) => lines.push(`    Flag: ${flag}`));
      result.evaluation.notes.slice(0, 3).forEach((note) => lines.push(`    Note: ${note}`));
      lines.push("");
    });
  });

  return lines.join("\n");
}
