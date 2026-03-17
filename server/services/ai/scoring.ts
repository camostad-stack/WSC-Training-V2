import { getConversationOutcomeState, isTerminalConversationState } from "../../../shared/conversation-outcome";
import {
  DEFAULT_EVALUATION_RUBRIC,
} from "../../../shared/evaluation-rubric";
import { getScenarioGoal } from "../../../shared/wsc-content";
import { analyzeEmployeeUtterance } from "../simulation/analysis";
import {
  evaluationResultSchema,
  type EvaluationResult,
  type ScenarioDirectorResult,
  type StateUpdateResult,
  type TranscriptTurn,
} from "./contracts";

export { DEFAULT_EVALUATION_RUBRIC };

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

type CategoryScores = EvaluationResult["category_scores"];
type PriorityCategory = keyof typeof DEFAULT_CATEGORY_SCORES;
type ScoreDimensions = NonNullable<EvaluationResult["score_dimensions"]>;

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
  criticalFailureDetected: boolean;
  noRealOwnershipDetected: boolean;
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
  const criticalFailureDetected =
    params.stateHistory.some((state) => Boolean(state.employee_flags?.critical_error))
    || analyses.some((analysis) =>
      analysis.disrespect
      || analysis.soundedRude
      || analysis.soundedDismissive
      || analysis.blameShifting
      || (analysis.policyMisuse && analysis.accuracy <= 3),
    );
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
  const noRealOwnershipDetected =
    !acceptedNextStep
    && !validRedirect
    && (
      !realNextStep
      || ownershipRate < 0.5
      || resolutionTurnRate < 0.34
      || avoidantRate >= 0.34
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
      criticalFailureDetected,
      noRealOwnershipDetected,
    } satisfies OutcomeEvidence,
  };
}

function capCategoryScore(value: number, maxAllowed: number, condition: boolean) {
  return clampScore(condition ? value : Math.min(value, maxAllowed));
}

export function deriveScoreDimensions(params: {
  categoryScores: CategoryScores;
  evidence: OutcomeEvidence;
}): ScoreDimensions {
  const memberConnection = clampScore(
    (average([
      params.categoryScores.opening_warmth,
      params.categoryScores.listening_empathy,
      params.categoryScores.visible_professionalism,
    ]) * 10)
      + (params.evidence.customerFeltHeard ? 6 : -4)
      + (params.evidence.deEscalated ? 4 : 0)
      - (params.evidence.disrespectRate >= 0.34 ? 18 : 0),
    0,
    100,
  );

  const listeningDiscovery = clampScore(
    (average([
      params.categoryScores.listening_empathy,
      params.categoryScores.clarity_directness,
    ]) * 10)
      + (params.evidence.addressedConcernRate >= 0.6 ? 8 : params.evidence.addressedConcern ? 2 : -10)
      + (params.evidence.customerFeltHeard ? 4 : -4)
      - (params.evidence.avoidantRate >= 0.5 ? 12 : 0),
    0,
    100,
  );

  const ownershipAccountability = clampScore(
    (average([
      params.categoryScores.ownership,
      params.categoryScores.closing_control,
    ]) * 10)
      + (params.evidence.acceptedNextStep ? 8 : 0)
      + (params.evidence.validRedirect ? 8 : 0)
      + (params.evidence.realNextStep ? 6 : -10)
      - (params.evidence.avoidantRate >= 0.5 ? 12 : 0),
    0,
    100,
  );

  const problemSolvingPolicy = clampScore(
    (average([
      params.categoryScores.policy_accuracy,
      params.categoryScores.problem_solving,
      params.categoryScores.escalation_judgment,
    ]) * 10)
      + (params.evidence.policyGroundedRate >= 0.6 ? 8 : params.evidence.policyGroundedRate >= 0.34 ? 2 : -8)
      + (params.evidence.solvedOrRedirected ? 8 : -6)
      + (params.evidence.validRedirect ? 6 : 0),
    0,
    100,
  );

  const clarityExpectationSetting = clampScore(
    (average([
      params.categoryScores.clarity_directness,
      params.categoryScores.ownership,
      params.categoryScores.closing_control,
    ]) * 10)
      + (params.evidence.addressedConcernRate >= 0.6 ? 6 : -6)
      + (params.evidence.realNextStepRate >= 0.4 ? 8 : -8)
      + (params.evidence.acceptedNextStep ? 6 : 0)
      - (params.evidence.avoidantRate >= 0.5 ? 10 : 0),
    0,
    100,
  );

  let resolutionControlBase = 18;
  if (params.evidence.finalOutcomeState === "RESOLVED") resolutionControlBase = 88;
  else if (params.evidence.finalOutcomeState === "ESCALATED") resolutionControlBase = params.evidence.validRedirect ? 78 : 26;
  else if (params.evidence.finalOutcomeState === "PARTIALLY_RESOLVED") resolutionControlBase = 34;
  else if (params.evidence.finalOutcomeState === "ABANDONED") resolutionControlBase = 10;
  else if (params.evidence.finalOutcomeState === "TIMED_OUT") resolutionControlBase = 6;

  const resolutionControl = clampScore(
    resolutionControlBase
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
    member_connection: memberConnection,
    listening_discovery: listeningDiscovery,
    ownership_accountability: ownershipAccountability,
    problem_solving_policy: problemSolvingPolicy,
    clarity_expectation_setting: clarityExpectationSetting,
    resolution_control: resolutionControl,
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

function findPenaltyRule(rubric: EvaluationResult["score_rubric"], key: string) {
  return rubric.hard_penalties.find((penalty) => penalty.key === key);
}

function applyPenaltyRule(params: {
  scoreDimensions: ScoreDimensions;
  overallCap: number;
  appliedPenaltyKeys: string[];
  rubric: EvaluationResult["score_rubric"];
  key: string;
}) {
  const penalty = findPenaltyRule(params.rubric, params.key);
  if (!penalty) {
    return params;
  }

  const adjusted = { ...params.scoreDimensions };
  if (penalty.dimension_caps) {
    for (const [dimensionKey, cap] of Object.entries(penalty.dimension_caps)) {
      if (typeof cap === "number" && dimensionKey in adjusted) {
        adjusted[dimensionKey as keyof typeof adjusted] = Math.min(adjusted[dimensionKey as keyof typeof adjusted], cap);
      }
    }
  }

  return {
    scoreDimensions: adjusted,
    overallCap: penalty.overall_cap !== undefined ? Math.min(params.overallCap, penalty.overall_cap) : params.overallCap,
    appliedPenaltyKeys: [...params.appliedPenaltyKeys, params.key],
  };
}

function applyRubricPenaltyCaps(params: {
  scoreDimensions: ScoreDimensions;
  evidence: OutcomeEvidence;
  rubric: EvaluationResult["score_rubric"];
}) {
  let adjusted = {
    ...params.scoreDimensions,
  };
  let overallCap = 100;
  const appliedPenaltyKeys: string[] = [];

  if (params.evidence.criticalFailureDetected) {
    const result = applyPenaltyRule({
      scoreDimensions: adjusted,
      overallCap,
      appliedPenaltyKeys,
      rubric: params.rubric,
      key: "critical_failure",
    });
    adjusted = result.scoreDimensions;
    overallCap = result.overallCap;
    appliedPenaltyKeys.splice(0, appliedPenaltyKeys.length, ...result.appliedPenaltyKeys);
  }

  if (params.evidence.prematureClosureDetected) {
    const result = applyPenaltyRule({
      scoreDimensions: adjusted,
      overallCap,
      appliedPenaltyKeys,
      rubric: params.rubric,
      key: "premature_closure",
    });
    adjusted = result.scoreDimensions;
    overallCap = result.overallCap;
    appliedPenaltyKeys.splice(0, appliedPenaltyKeys.length, ...result.appliedPenaltyKeys);
  }

  if (params.evidence.noRealOwnershipDetected) {
    const result = applyPenaltyRule({
      scoreDimensions: adjusted,
      overallCap,
      appliedPenaltyKeys,
      rubric: params.rubric,
      key: "no_real_ownership",
    });
    adjusted = result.scoreDimensions;
    overallCap = result.overallCap;
    appliedPenaltyKeys.splice(0, appliedPenaltyKeys.length, ...result.appliedPenaltyKeys);
  }

  return {
    scoreDimensions: adjusted,
    overallCap,
    appliedPenaltyKeys,
  };
}

export function calculateOverallScore(params: {
  scoreDimensions: ScoreDimensions;
  rubric?: EvaluationResult["score_rubric"];
  overallCap?: number;
}) {
  const rubric = params.rubric || DEFAULT_EVALUATION_RUBRIC;
  const weightedScore = clampScore(
    Math.round(
      params.scoreDimensions.member_connection * (rubric.dimension_weights.member_connection / 100)
      + params.scoreDimensions.listening_discovery * (rubric.dimension_weights.listening_discovery / 100)
      + params.scoreDimensions.ownership_accountability * (rubric.dimension_weights.ownership_accountability / 100)
      + params.scoreDimensions.problem_solving_policy * (rubric.dimension_weights.problem_solving_policy / 100)
      + params.scoreDimensions.clarity_expectation_setting * (rubric.dimension_weights.clarity_expectation_setting / 100)
      + params.scoreDimensions.resolution_control * (rubric.dimension_weights.resolution_control / 100),
    ),
    0,
    100,
  );

  return params.overallCap !== undefined ? Math.min(weightedScore, params.overallCap) : weightedScore;
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
  const ungatedScoreDimensions = deriveScoreDimensions({
    categoryScores,
    evidence,
  });
  const scoreRubric = params.rubric || params.rawEvaluation.score_rubric || DEFAULT_EVALUATION_RUBRIC;
  const { scoreDimensions, overallCap, appliedPenaltyKeys } = applyRubricPenaltyCaps({
    scoreDimensions: ungatedScoreDimensions,
    evidence,
    rubric: scoreRubric,
  });
  const overallScore = calculateOverallScore({
    scoreDimensions,
    rubric: scoreRubric,
    overallCap,
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
    applied_rubric_penalties: Array.from(new Set([
      ...(params.rawEvaluation.applied_rubric_penalties || []),
      ...appliedPenaltyKeys,
    ])),
    best_moments: bestMoments,
    missed_moments: missedMoments,
    most_important_correction:
      missedMoments[0]
      || params.rawEvaluation.most_important_correction
      || `Keep the conversation grounded in the real outcome for ${getScenarioGoal(params.scenarioJson).title}.`,
    summary: `${params.rawEvaluation.summary} Final outcome: ${evidence.finalOutcomeState}. Resolution control and clear ownership carried the most weight in the final score.`,
  });
}
