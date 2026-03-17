import { getConversationOutcomeState, isTerminalConversationState } from "../../../shared/conversation-outcome";
import { getScenarioGoal } from "../../../shared/wsc-content";
import { analyzeEmployeeUtterance } from "../simulation/analysis";
import {
  evaluationResultSchema,
  type EvaluationResult,
  type ScenarioDirectorResult,
  type StateUpdateResult,
  type TranscriptTurn,
} from "./contracts";

export const DEFAULT_CATEGORY_SCORES = {
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

export const DEFAULT_EVALUATION_RUBRIC = {
  name: "Outcome Weighted",
  dimension_weights: {
    interaction_quality: 20,
    operational_effectiveness: 25,
    outcome_quality: 55,
  },
} as const satisfies EvaluationResult["score_rubric"];

type CategoryScores = EvaluationResult["category_scores"];
type PriorityCategory = keyof typeof DEFAULT_CATEGORY_SCORES;

export type OutcomeEvidence = {
  finalOutcomeState: string;
  acceptedNextStep: boolean;
  validRedirect: boolean;
  prematureClosureDetected: boolean;
  unresolvedCriteria: string[];
  customerImproved: boolean;
  deEscalated: boolean;
  addressedConcern: boolean;
  addressedConcernRate: number;
  realNextStep: boolean;
  realNextStepRate: number;
  solvedOrRedirected: boolean;
  customerFeltHeard: boolean;
  customerFeltHeardRate: number;
  ownershipRate: number;
  avoidantRate: number;
  disrespectRate: number;
  policyGroundedRate: number;
  resolutionTurnRate: number;
};

function clampScore(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeEmotionLabel(value?: string) {
  return (value || "").trim().toLowerCase();
}

function isCalmerEmotion(value?: string) {
  return ["calm", "calmer", "reassured", "relieved", "steady"].includes(normalizeEmotionLabel(value));
}

function isEscalatedEmotion(value?: string) {
  return ["angry", "upset", "alarmed", "offended", "defensive", "withdrawn", "done"].includes(normalizeEmotionLabel(value));
}

function deriveAnalysesFromTranscript(params: {
  scenarioJson: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
}) {
  const analyses: StateUpdateResult["latest_employee_analysis"][] = [];
  const priorPromisesMade: string[] = [];
  const previousEmployeeMessages: string[] = [];
  let latestCustomerMessage: string | undefined;

  for (const turn of params.transcript) {
    if (turn.role === "customer") {
      latestCustomerMessage = turn.message;
      continue;
    }

    const analysis = analyzeEmployeeUtterance(turn.message, params.scenarioJson, {
      latestCustomerMessage,
      priorPromisesMade,
      previousEmployeeMessages,
      scenarioGoal: getScenarioGoal(params.scenarioJson).title,
    });

    analyses.push(analysis);
    previousEmployeeMessages.push(turn.message);

    if (
      analysis.explicitNextStep
      || analysis.explicitTimeline
      || analysis.explicitManagerMention
      || analysis.explicitRecommendation
    ) {
      priorPromisesMade.push(turn.message);
    }
  }

  return analyses;
}

export function getScenarioPriorityProfile(scenario: ScenarioDirectorResult) {
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

export function applyScenarioPriorityWeights(
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

export function buildStateHistoryEvidence(params: {
  scenarioJson: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  stateHistory: StateUpdateResult[];
}) {
  const initialState = params.stateHistory[0];
  const finalState = params.stateHistory[params.stateHistory.length - 1];
  const analysesFromState = params.stateHistory
    .map((state) => state.latest_employee_analysis)
    .filter((analysis): analysis is NonNullable<typeof analysis> => Boolean(analysis));
  const analyses = analysesFromState.length > 0
    ? analysesFromState
    : deriveAnalysesFromTranscript({
      scenarioJson: params.scenarioJson,
      transcript: params.transcript,
    });

  const finalOutcomeState = getConversationOutcomeState(finalState || {});
  const totalAnalyses = Math.max(analyses.length, 1);
  const count = (predicate: (analysis: (typeof analyses)[number]) => boolean) => analyses.filter(predicate).length;
  const acceptedNextStep = finalState?.accepted_next_step ?? analyses.some((analysis) =>
    analysis.tookOwnership
    && !analysis.avoidedQuestion
    && !analysis.disrespect
    && (
      analysis.explicitNextStep
      || analysis.explicitTimeline
      || analysis.explicitDirection
      || analysis.explicitRecommendation
    ),
  );
  const validRedirect = finalState?.valid_redirect ?? analyses.some((analysis) =>
    analysis.explicitManagerMention
    && analysis.escalatedAppropriately
    && !analysis.soundedDismissive
    && !analysis.soundedRude,
  );
  const prematureClosureDetected = params.stateHistory.some((state) => state.premature_closure_detected);
  const unresolvedCriteria = finalState?.unmet_completion_criteria || [];
  const realNextStep = analyses.some((analysis) => analysis.explicitNextStep || analysis.explicitTimeline || analysis.explicitDirection || analysis.explicitRecommendation);
  const addressedConcernCount = count((analysis) =>
    analysis.answeredQuestion
    || analysis.explicitExplanation
    || analysis.explicitVerification
    || analysis.explicitDiscovery
    || analysis.explicitDirection,
  );
  const addressedConcern = addressedConcernCount > 0;
  const addressedConcernRate = addressedConcernCount / totalAnalyses;
  const customerFeltHeardCount = count((analysis) => analysis.madeCustomerFeelHeard);
  const customerFeltHeard = customerFeltHeardCount > 0 && addressedConcern;
  const ownershipRate = count((analysis) => analysis.tookOwnership) / totalAnalyses;
  const avoidantRate = count((analysis) =>
    analysis.avoidedQuestion
    || analysis.deadEndLanguage
    || analysis.vaguenessDetected
    || analysis.likelyStalled,
  ) / totalAnalyses;
  const disrespectRate = count((analysis) =>
    analysis.disrespect
    || analysis.soundedRude
    || analysis.soundedDismissive
    || analysis.blameShifting,
  ) / totalAnalyses;
  const policyGroundedRate = count((analysis) =>
    analysis.accuracy >= 6 && (analysis.explicitExplanation || analysis.explicitVerification || analysis.explicitDirection),
  ) / totalAnalyses;
  const resolutionTurnRate = count((analysis) =>
    analysis.explicitNextStep
    || analysis.explicitTimeline
    || analysis.explicitRecommendation
    || analysis.escalatedAppropriately,
  ) / totalAnalyses;
  const customerImproved = Boolean(initialState && finalState)
    && (
      (finalState.trust_level > initialState.trust_level)
      || (finalState.issue_clarity > initialState.issue_clarity)
      || (finalState.offense_level < initialState.offense_level)
      || (isCalmerEmotion(finalState.emotion_state) && !isEscalatedEmotion(initialState.emotion_state))
    );
  const deEscalated = Boolean(initialState && finalState)
    && (
      finalState.offense_level < initialState.offense_level
      || finalState.manager_request_level < initialState.manager_request_level
      || (isCalmerEmotion(finalState.emotion_state) && !isEscalatedEmotion(initialState.emotion_state))
    );

  return {
    analyses,
    finalState,
    evidence: {
      finalOutcomeState,
      acceptedNextStep,
      validRedirect,
      prematureClosureDetected,
      unresolvedCriteria,
      customerImproved,
      deEscalated,
      addressedConcern,
      addressedConcernRate,
      realNextStep,
      realNextStepRate: resolutionTurnRate,
      solvedOrRedirected: isTerminalConversationState(finalState || {})
        || (acceptedNextStep && unresolvedCriteria.length === 0),
      customerFeltHeard,
      customerFeltHeardRate: customerFeltHeardCount / totalAnalyses,
      ownershipRate,
      avoidantRate,
      disrespectRate,
      policyGroundedRate,
      resolutionTurnRate,
    } satisfies OutcomeEvidence,
  };
}

function capCategoryScore(value: number, maxAllowed: number, condition: boolean) {
  return clampScore(condition ? value : Math.min(value, maxAllowed));
}

export function deriveScoreDimensions(params: {
  categoryScores: CategoryScores;
  evidence: OutcomeEvidence;
}) {
  const interactionQuality = clampScore(average([
    params.categoryScores.opening_warmth,
    params.categoryScores.listening_empathy,
    params.categoryScores.clarity_directness,
    params.categoryScores.de_escalation,
    params.categoryScores.visible_professionalism,
  ]) * 10, 0, 100);

  const operationalEffectiveness = clampScore(average([
    params.categoryScores.policy_accuracy,
    params.categoryScores.ownership,
    params.categoryScores.problem_solving,
    params.categoryScores.escalation_judgment,
    params.categoryScores.closing_control,
  ]) * 10, 0, 100);

  let outcomeQualityBase = 18;
  if (params.evidence.finalOutcomeState === "RESOLVED") outcomeQualityBase = 88;
  else if (params.evidence.finalOutcomeState === "ESCALATED") outcomeQualityBase = params.evidence.validRedirect ? 76 : 28;
  else if (params.evidence.finalOutcomeState === "PARTIALLY_RESOLVED") outcomeQualityBase = 34;
  else if (params.evidence.finalOutcomeState === "ABANDONED") outcomeQualityBase = 10;
  else if (params.evidence.finalOutcomeState === "TIMED_OUT") outcomeQualityBase = 6;

  const outcomeQuality = clampScore(
    outcomeQualityBase
      + (params.evidence.acceptedNextStep ? 6 : 0)
      + (params.evidence.validRedirect ? 6 : 0)
      + (params.evidence.customerImproved ? 4 : -4)
      + (params.evidence.addressedConcernRate >= 0.6 ? 4 : -6)
      + (params.evidence.realNextStepRate >= 0.4 ? 4 : -6)
      - (params.evidence.prematureClosureDetected ? 18 : 0)
      - Math.min(params.evidence.unresolvedCriteria.length * 10, 30)
      - (params.evidence.avoidantRate >= 0.5 ? 8 : 0)
      - (params.evidence.disrespectRate >= 0.34 ? 8 : 0),
    0,
    100,
  );

  return {
    interaction_quality: interactionQuality,
    operational_effectiveness: operationalEffectiveness,
    outcome_quality: outcomeQuality,
  } satisfies EvaluationResult["score_dimensions"];
}

export function gateCategoryScores(params: {
  scenarioJson: ScenarioDirectorResult;
  categoryScores: CategoryScores;
  evidence: OutcomeEvidence;
}) {
  const strongConcernHandling =
    params.evidence.addressedConcern
    && params.evidence.addressedConcernRate >= 0.5
    && params.evidence.customerFeltHeard
    && params.evidence.customerFeltHeardRate >= 0.4;
  const strongOwnership =
    (params.evidence.realNextStep || params.evidence.validRedirect)
    && params.evidence.ownershipRate >= 0.5
    && params.evidence.avoidantRate < 0.5;
  const strongProblemSolving =
    params.evidence.solvedOrRedirected
    && params.evidence.realNextStepRate >= 0.4
    && params.evidence.unresolvedCriteria.length === 0;
  const strongDeEscalation =
    params.evidence.deEscalated
    && params.evidence.customerImproved
    && params.evidence.disrespectRate < 0.34;
  const cleanClosure =
    !params.evidence.prematureClosureDetected
    && params.evidence.unresolvedCriteria.length === 0
    && (
      (params.evidence.finalOutcomeState === "RESOLVED" && params.evidence.acceptedNextStep)
      || (params.evidence.finalOutcomeState === "ESCALATED" && params.evidence.validRedirect && params.evidence.acceptedNextStep)
    );

  return evaluationResultSchema.shape.category_scores.parse({
    ...params.categoryScores,
    listening_empathy: capCategoryScore(
      params.categoryScores.listening_empathy,
      strongConcernHandling ? 10 : params.evidence.addressedConcern ? 5 : 3,
      strongConcernHandling,
    ),
    clarity_directness: capCategoryScore(
      params.categoryScores.clarity_directness,
      params.evidence.addressedConcernRate >= 0.5 && params.evidence.avoidantRate < 0.5 ? 7 : 4,
      params.evidence.addressedConcernRate >= 0.75 && params.evidence.avoidantRate < 0.34,
    ),
    policy_accuracy: capCategoryScore(
      params.categoryScores.policy_accuracy,
      params.evidence.policyGroundedRate >= 0.4 ? 7 : 4,
      params.evidence.policyGroundedRate >= 0.6,
    ),
    ownership: capCategoryScore(
      params.categoryScores.ownership,
      strongOwnership ? 10 : params.evidence.realNextStep || params.evidence.validRedirect ? 5 : 2,
      strongOwnership,
    ),
    problem_solving: capCategoryScore(
      params.categoryScores.problem_solving,
      strongProblemSolving ? 10 : params.evidence.realNextStep || params.evidence.validRedirect ? 4 : 2,
      strongProblemSolving,
    ),
    de_escalation: capCategoryScore(
      params.categoryScores.de_escalation,
      strongDeEscalation ? 10 : params.evidence.deEscalated ? 4 : 2,
      strongDeEscalation,
    ),
    closing_control: capCategoryScore(
      params.categoryScores.closing_control,
      cleanClosure ? 10 : params.evidence.finalOutcomeState === "RESOLVED" || params.evidence.finalOutcomeState === "ESCALATED" ? 4 : 1,
      cleanClosure,
    ),
    visible_professionalism: capCategoryScore(
      params.categoryScores.visible_professionalism,
      params.evidence.disrespectRate < 0.34 ? 7 : 3,
      params.evidence.disrespectRate === 0,
    ),
  });
}

function calculateOverallScore(params: {
  scoreDimensions: EvaluationResult["score_dimensions"];
  rubric?: EvaluationResult["score_rubric"];
}) {
  const rubric = params.rubric || DEFAULT_EVALUATION_RUBRIC;
  return clampScore(
    Math.round(
      params.scoreDimensions.interaction_quality * (rubric.dimension_weights.interaction_quality / 100)
      + params.scoreDimensions.operational_effectiveness * (rubric.dimension_weights.operational_effectiveness / 100)
      + params.scoreDimensions.outcome_quality * (rubric.dimension_weights.outcome_quality / 100),
    ),
    0,
    100,
  );
}

export function finalizeEvaluationFromEvidence(params: {
  scenarioJson: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  stateHistory: StateUpdateResult[];
  rawEvaluation: EvaluationResult;
  rubric?: EvaluationResult["score_rubric"];
}) {
  const { evidence } = buildStateHistoryEvidence({
    scenarioJson: params.scenarioJson,
    transcript: params.transcript,
    stateHistory: params.stateHistory,
  });
  const weightedCategoryScores = evaluationResultSchema.shape.category_scores.parse(
    applyScenarioPriorityWeights(params.scenarioJson, params.rawEvaluation.category_scores),
  );
  const categoryScores = gateCategoryScores({
    scenarioJson: params.scenarioJson,
    categoryScores: weightedCategoryScores,
    evidence,
  });
  const scoreDimensions = deriveScoreDimensions({
    categoryScores,
    evidence,
  });
  const scoreRubric = params.rubric || params.rawEvaluation.score_rubric || DEFAULT_EVALUATION_RUBRIC;
  const overallScore = calculateOverallScore({
    scoreDimensions,
    rubric: scoreRubric,
  });
  const passFail = overallScore >= 80 ? "pass" : overallScore >= 65 ? "borderline" : "fail";
  const readiness = overallScore >= 85 ? "independent" : overallScore >= 75 ? "partially_independent" : overallScore >= 60 ? "shadow_ready" : "practice_more";

  const missedMoments = Array.from(new Set([
    ...(params.rawEvaluation.missed_moments || []),
    ...(!evidence.addressedConcern ? ["Did not fully answer or address the customer's concern."] : []),
    ...(!evidence.realNextStep && !evidence.validRedirect ? ["Did not provide a real next step or valid handoff."] : []),
    ...(evidence.prematureClosureDetected ? ["Tried to close the conversation before the issue was actually resolved."] : []),
    ...(!evidence.deEscalated ? ["Did not measurably improve the customer state before closing or redirecting."] : []),
    ...evidence.unresolvedCriteria.map((criterion) => `Left this unresolved: ${criterion}.`),
  ]));

  const bestMoments = Array.from(new Set([
    ...(params.rawEvaluation.best_moments || []),
    ...(evidence.customerFeltHeard ? ["Made the customer feel heard and addressed the real concern."] : []),
    ...(evidence.acceptedNextStep ? ["Created a concrete next step the customer could accept."] : []),
    ...(evidence.validRedirect ? ["Handled the escalation path cleanly with a valid redirect."] : []),
  ]));

  return evaluationResultSchema.parse({
    ...params.rawEvaluation,
    overall_score: overallScore,
    pass_fail: passFail,
    readiness_signal: readiness,
    category_scores: categoryScores,
    score_dimensions: scoreDimensions,
    score_rubric: scoreRubric,
    best_moments: bestMoments,
    missed_moments: missedMoments,
    most_important_correction:
      missedMoments[0]
      || params.rawEvaluation.most_important_correction
      || `Keep the conversation grounded in the real outcome for ${getScenarioGoal(params.scenarioJson).title}.`,
    summary: `${params.rawEvaluation.summary} Final outcome: ${evidence.finalOutcomeState}. Outcome quality was weighted heavily in the final score.`,
  });
}
