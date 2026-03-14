import type { ScenarioDirectorResult } from "../ai/contracts";
import type {
  EmployeeUtteranceAnalysis,
  EmployeeUtteranceContext,
  LlmAssistedUtteranceAssessment,
  UtteranceReactionThresholds,
} from "./types";

function clamp(value: number, min = 0, max = 10) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function testAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

const TOPIC_STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "have",
  "will",
  "your",
  "what",
  "when",
  "where",
  "which",
  "while",
  "about",
  "there",
  "here",
  "just",
  "into",
  "need",
  "want",
  "like",
  "really",
  "actually",
  "still",
  "does",
  "doesnt",
  "dont",
  "can't",
  "cant",
]);

const POLITE_PATTERNS = [/\bplease\b/i, /\bthank you\b/i, /\bthanks for telling me\b/i, /\bi appreciate that\b/i, /\bma'?am\b/i, /\bsir\b/i];
const WARM_PATTERNS = [/\bwelcome\b/i, /\bhappy to help\b/i, /\bglad you came in\b/i, /\bthanks for coming in\b/i, /\bof course\b/i, /\babsolutely\b/i];
const RESPECT_PATTERNS = [/\bi hear you\b/i, /\bi understand\b/i, /\bi can see why\b/i, /\bthat makes sense\b/i, /\bthanks for your patience\b/i];
const EMPATHY_PATTERNS = [/\bsorry\b/i, /\bfrustrat/i, /\bupsetting\b/i, /\bconcerning\b/i, /\bi can see why\b/i, /\bthat would be disappointing\b/i];
const OWNERSHIP_PATTERNS = [
  /\bi will\b/i,
  /\bi'll\b/i,
  /\blet me\b/i,
  /\bi am going to\b/i,
  /\bi'm going to\b/i,
  /\bi can take care of\b/i,
  /\bi'll handle\b/i,
  /\bi'm on it\b/i,
  /\btake ownership\b/i,
  /\btaking ownership\b/i,
  /\btake control\b/i,
  /\btaking control\b/i,
  /\bi am (sending|processing|correcting|fixing|reviewing|checking|escalating)\b/i,
  /\bi'm (sending|processing|correcting|fixing|reviewing|checking|escalating)\b/i,
  /\bi can (start|send|process|fix|correct|escalate|get .* moving|get .* started)\b/i,
];
const PROFESSIONAL_PATTERNS = [/\blet me walk you through\b/i, /\bhere is what i can do\b/i, /\bhere is what happens next\b/i, /\bthe next step\b/i, /\bconfirmation\b/i];
const TIMELINE_PATTERNS = [/\bwithin\b/i, /\btoday\b/i, /\bthis afternoon\b/i, /\bthis morning\b/i, /\bminutes\b/i, /\bhours\b/i, /\bbefore you leave\b/i, /\bnext update\b/i, /\byou will hear\b/i, /\buntil care arrives\b/i, /\buntil help arrives\b/i];
const VERIFICATION_PATTERNS = [/\bcheck\b/i, /\bverify\b/i, /\breview\b/i, /\bconfirm\b/i, /\bpull up\b/i, /\blook into\b/i, /\baccount\b/i, /\bledger\b/i, /\breservation\b/i, /\bbooking\b/i];
const EXPLANATION_PATTERNS = [
  /\bhere'?s what happened\b/i,
  /\bthat means\b/i,
  /\bthe reason\b/i,
  /\bpending\b/i,
  /\bfinal\b/i,
  /\bstatus\b/i,
  /\bwhat happened\b/i,
  /\bhere'?s why\b/i,
  /\bincludes\b/i,
  /\byou can use\b/i,
  /\byour current membership\b/i,
  /\byour membership includes\b/i,
];
const NEXT_STEP_PATTERNS = [/\bnext step\b/i, /\brefund\b/i, /\bcredit\b/i, /\brebook\b/i, /\bbook\b/i, /\bschedule\b/i, /\bwalk you through\b/i, /\bset that up\b/i, /\bfollow up\b/i, /\bconfirmation\b/i, /\bmanager will\b/i, /\bcorrection\b/i, /\bfix this\b/i, /\bsend(?:ing)?\b/i, /\bprocess(?:ing)?\b/i];
const DISCOVERY_PATTERNS = [/\bwhat are you looking for\b/i, /\bwhat matters most\b/i, /\bhow often\b/i, /\btell me about\b/i, /\bwhat kind of\b/i, /\bwhat are you hoping\b/i, /\bwhat do you want out of\b/i];
const RECOMMENDATION_PATTERNS = [/\brecommend\b/i, /\bbest fit\b/i, /\bi'?d suggest\b/i, /\bfor someone like you\b/i, /\bhere'?s the best option\b/i];
const SAFETY_PATTERNS = [/\b911\b/i, /\bems\b/i, /\bemergency\b/i, /\bsecure\b/i, /\bblock off\b/i, /\btag out\b/i, /\bout of use\b/i, /\bstabilize\b/i, /\bcare arrives\b/i, /\bclear the area\b/i];
const DIRECTION_PATTERNS = [/\bstay\b/i, /\bkeep\b/i, /\bmove\b/i, /\bstep back\b/i, /\bdo not\b/i, /\bmeet ems\b/i, /\bcome with me\b/i, /\bclear the area\b/i, /\bwait here\b/i];
const MANAGER_PATTERNS = [/\bmanager\b/i, /\bsupervisor\b/i, /\bmod\b/i];
const CLOSURE_PATTERNS = [/\bare we all set\b/i, /\bdoes that work\b/i, /\bsound good\b/i, /\banything else\b/i, /\bwe'?re all set\b/i, /\byou'?re good to go\b/i, /\bthat should take care of it\b/i, /\bhave a good one\b/i, /\bhave a nice day\b/i, /\bthanks\b.*\bcome back\b/i];

const DISMISSIVE_PATTERNS = [/\bcalm down\b/i, /\brelax\b/i, /\bwhatever\b/i, /\bjust wait\b/i, /\bi already told you\b/i, /\bit'?s fine\b/i, /\bthat is just the policy\b/i, /\bdeal with it\b/i];
const RUDE_PATTERNS = [/\bthat'?s not my problem\b/i, /\bthat'?s your fault\b/i, /\byou people\b/i, /\bnot my issue\b/i, /\bdeal with it\b/i];
const BLAME_PATTERNS = [/\byour fault\b/i, /\byou should have\b/i, /\byou must have\b/i, /\byou need to fix that\b/i];
const PASSIVE_AGGRESSIVE_PATTERNS = [/\bas i said\b/i, /\blike i told you\b/i, /\bif you had listened\b/i, /\bobviously\b/i];
const DEAD_END_PATTERNS = [/\bnothing i can do\b/i, /\bcan'?t help\b/i, /\bdon'?t know\b/i, /\bnot my department\b/i, /\bcall your bank\b/i, /\byou need to talk to someone else\b/i];
const VAGUE_PATTERNS = [/\blook into it\b/i, /\bget back to you\b/i, /\bas soon as possible\b/i, /\bsoon\b/i, /\bsomeone will\b/i, /\bwe'?ll see\b/i];
const HEDGE_PATTERNS = [/\bmaybe\b/i, /\bprobably\b/i, /\bkind of\b/i, /\bsort of\b/i, /\bi think\b/i, /\bshould be\b/i];
const ROBOTIC_PATTERNS = [
  /\bthank you for bringing this to our attention\b/i,
  /\bwe value your membership\b/i,
  /\bper policy\b/i,
  /\bper procedure\b/i,
  /\bgoing forward\b/i,
  /\bi understand your frustration\b/i,
  /\bi appreciate your patience\b/i,
  /\bassist you with this matter\b/i,
  /\bwork toward a resolution\b/i,
  /\bhow you would like to proceed\b/i,
];
const PATRONIZING_PATTERNS = [/\bhere'?s the thing\b/i, /\bit'?s pretty simple\b/i, /\bclearly\b/i, /\bjust listen\b/i, /\byou just need to\b/i, /\bit works like this\b/i];

function extractTopicKeywords(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 4 && !TOPIC_STOPWORDS.has(word)),
    ),
  );
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((word) => rightSet.has(word)).length;
}

function jaccardSimilarity(left: string, right: string) {
  const leftTokens = extractTopicKeywords(left);
  const rightTokens = extractTopicKeywords(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((word) => rightSet.has(word)).length;
  const unionSet = new Set(leftTokens);
  for (const token of rightTokens) {
    unionSet.add(token);
  }
  const union = unionSet.size;
  return union === 0 ? 0 : intersection / union;
}

function addressesLatestQuestion(params: {
  latestCustomerMessage?: string;
  employeeMessage: string;
  verification: boolean;
  explanation: boolean;
  nextStep: boolean;
  timeline: boolean;
  ownership: boolean;
  explicitManager: boolean;
  discovery: boolean;
  recommendation: boolean;
  direction: boolean;
  safetyAction: boolean;
}) {
  const latest = params.latestCustomerMessage?.trim();
  if (!latest) return true;

  const latestLower = latest.toLowerCase();
  const employeeLower = params.employeeMessage.toLowerCase();
  const latestKeywords = extractTopicKeywords(latestLower);
  const employeeKeywords = extractTopicKeywords(employeeLower);
  const sharedTopics = overlapCount(latestKeywords, employeeKeywords);

  if (/manager|supervisor|someone else/.test(latestLower)) {
    return params.explicitManager || params.nextStep || params.timeline;
  }
  if (/when|how long|timeline|hear back|update/.test(latestLower)) {
    return params.timeline || params.nextStep;
  }
  if (/what (are|is) (you|we).*do|what happens next|next step/.test(latestLower)) {
    return params.nextStep || params.ownership || params.explicitManager || params.direction;
  }
  if (/why|reason|how did/.test(latestLower)) {
    return params.explanation || params.verification;
  }
  if (/what.*check|what.*verify|what.*pulling up/.test(latestLower)) {
    return params.verification || params.ownership;
  }
  if (/safe|emergency|what should we do/.test(latestLower)) {
    return params.direction || params.safetyAction || params.nextStep;
  }
  if (/looking for|fit|recommend/.test(latestLower)) {
    return params.discovery || params.recommendation;
  }

  if (latestKeywords.length === 0) {
    return params.explanation || params.nextStep || params.verification || params.discovery;
  }

  return sharedTopics >= 1 || params.explanation || params.nextStep || params.verification || params.discovery;
}

export const ANALYZER_REACTION_THRESHOLDS: UtteranceReactionThresholds = {
  feelHeardMin: 6,
  trustGainMin: 7,
  frustrationIncreaseMaxHelpfulness: 4,
  escalationRiskMin: 7,
  leaveRiskMinRespect: 3,
  competenceGainMin: 6,
};

export function buildUtteranceAnalysisDefaults(): EmployeeUtteranceAnalysis {
  return {
    clarity: 3,
    politeness: 5,
    warmth: 4,
    confidence: 3,
    respectfulness: 5,
    empathy: 3,
    professionalism: 4,
    accuracy: 5,
    accuracyConfidence: 4,
    ownership: 3,
    helpfulness: 3,
    directness: 3,
    explanationQuality: 3,
    nextStepQuality: 3,
    respectImpact: 0,
    heardImpact: 0,
    escalationJudgment: 5,
    toneLabels: ["neutral"],
    strengths: [],
    issues: [],
    serviceSummary: "no employee response yet",
    answeredQuestion: false,
    avoidedQuestion: false,
    soundedDismissive: false,
    soundedRude: false,
    setExpectationsClearly: false,
    tookOwnership: false,
    escalatedAppropriately: false,
    madeCustomerFeelHeard: false,
    contradictionDetected: false,
    vaguenessDetected: false,
    fakeConfidence: false,
    blameShifting: false,
    policyMisuse: false,
    overTalking: false,
    deadEndLanguage: false,
    disrespect: false,
    passiveAggression: false,
    roboticPhrasing: false,
    explicitManagerMention: false,
    explicitDisrespect: false,
    explicitOwnership: false,
    explicitNextStep: false,
    explicitTimeline: false,
    explicitVerification: false,
    explicitExplanation: false,
    explicitSafetyControl: false,
    explicitDirection: false,
    explicitDiscovery: false,
    explicitRecommendation: false,
    explicitClosureAttempt: false,
    likelySolved: false,
    likelyStalled: true,
    summary: "no employee response yet",
  };
}

function buildScenarioAnswerExpectation(scenario: ScenarioDirectorResult) {
  if (scenario.scenario_family === "emergency_response") {
    return {
      needsFacts: true,
      needsAction: true,
      needsDirection: true,
      needsNextStep: true,
    };
  }

  if (scenario.department === "golf") {
    return {
      needsFacts: false,
      needsAction: false,
      needsDirection: false,
      needsNextStep: true,
    };
  }

  if (scenario.scenario_family === "membership_question") {
    return {
      needsFacts: true,
      needsAction: false,
      needsDirection: false,
      needsNextStep: false,
    };
  }

  return {
    needsFacts: true,
    needsAction: true,
    needsDirection: false,
    needsNextStep: true,
  };
}

function detectContradiction(text: string, priorPromises: string[]) {
  const normalized = text.toLowerCase();
  const internalContradiction =
    (/\bpending\b/.test(normalized) && /\bposted\b/.test(normalized))
    || (/\bfinal\b/.test(normalized) && /\bnot final\b/.test(normalized))
    || (/\bnothing to review\b/.test(normalized) && /\breview|checking|verify\b/.test(normalized))
    || (/\bcan'?t do anything\b/.test(normalized) && /\bi will\b/.test(normalized));

  if (internalContradiction) return true;
  if (priorPromises.length === 0) return false;
  return priorPromises.some((promise) => {
    const lower = promise.toLowerCase();
    if (lower.includes("refund") && /cannot refund|won't refund|not refunding/.test(normalized)) return true;
    if (lower.includes("manager") && /no manager|not getting a manager/.test(normalized)) return true;
    if (lower.includes("update") && /i don't know when/.test(normalized)) return true;
    return false;
  });
}

function deriveToneLabels(flags: {
  dismissive: boolean;
  rude: boolean;
  passiveAggressive: boolean;
  robotic: boolean;
  respectful: boolean;
  warm: boolean;
  confident: boolean;
  uncertain: boolean;
  directive: boolean;
}) {
  const labels: string[] = [];
  if (flags.dismissive) labels.push("dismissive");
  if (flags.rude) labels.push("rude");
  if (flags.passiveAggressive) labels.push("passive_aggressive");
  if (flags.robotic) labels.push("robotic");
  if (flags.respectful) labels.push("respectful");
  if (flags.warm) labels.push("warm");
  if (flags.confident) labels.push("confident");
  if (flags.uncertain) labels.push("uncertain");
  if (flags.directive) labels.push("directive");
  return labels.length > 0 ? labels : ["neutral"];
}

export function analyzeEmployeeUtterance(
  message: string,
  scenario: ScenarioDirectorResult,
  context: EmployeeUtteranceContext = {},
): EmployeeUtteranceAnalysis {
  const defaults = buildUtteranceAnalysisDefaults();
  const text = message.trim();
  if (!text) return defaults;

  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const expectation = buildScenarioAnswerExpectation(scenario);

  const politeness = testAny(text, POLITE_PATTERNS);
  const warmth = testAny(text, WARM_PATTERNS);
  const respectful = politeness || testAny(text, RESPECT_PATTERNS);
  const empathy = testAny(text, EMPATHY_PATTERNS);
  const ownership = testAny(text, OWNERSHIP_PATTERNS);
  const professional = testAny(text, PROFESSIONAL_PATTERNS);
  const timeline = testAny(text, TIMELINE_PATTERNS);
  const verification = testAny(text, VERIFICATION_PATTERNS);
  const explanation = testAny(text, EXPLANATION_PATTERNS);
  const nextStep = testAny(text, NEXT_STEP_PATTERNS);
  const discovery = testAny(text, DISCOVERY_PATTERNS) || (scenario.department === "golf" && /\?/.test(text));
  const recommendation = testAny(text, RECOMMENDATION_PATTERNS);
  const safetyAction = testAny(text, SAFETY_PATTERNS);
  const direction = testAny(text, DIRECTION_PATTERNS);
  const explicitManager = testAny(text, MANAGER_PATTERNS);
  const explicitClosureAttempt = testAny(text, CLOSURE_PATTERNS);
  const dismissive = testAny(text, DISMISSIVE_PATTERNS);
  const rude = testAny(text, RUDE_PATTERNS);
  const blameShifting = testAny(text, BLAME_PATTERNS);
  const passiveAggression = testAny(text, PASSIVE_AGGRESSIVE_PATTERNS);
  const deadEndLanguage = testAny(text, DEAD_END_PATTERNS);
  const vagueness = testAny(text, VAGUE_PATTERNS);
  const hedging = testAny(text, HEDGE_PATTERNS);
  const robotic = testAny(text, ROBOTIC_PATTERNS);
  const patronizing = testAny(text, PATRONIZING_PATTERNS);
  const contradiction = detectContradiction(text, context.priorPromisesMade || []);
  const overTalking = wordCount >= 45 && !timeline && !nextStep;
  const repetitiveResponse = (context.previousEmployeeMessages || []).some(
    (priorMessage) => jaccardSimilarity(priorMessage, text) >= 0.72,
  );
  const deliveryAnalysis = context.deliveryAnalysis;
  const rushedRisk = deliveryAnalysis?.delivery?.rushedRisk || "low";
  const hesitationRisk = deliveryAnalysis?.pacing?.hesitationRisk || "low";
  const interruptionRisk = deliveryAnalysis?.delivery?.interruptionRisk || "low";
  const sharpnessRisk = deliveryAnalysis?.delivery?.sharpnessRisk || "low";
  const fragmentationRisk = deliveryAnalysis?.delivery?.fragmentationRisk || "low";
  const pacingStabilityRisk = deliveryAnalysis?.delivery?.pacingStabilityRisk || "low";
  const disfluencyRisk = deliveryAnalysis?.delivery?.disfluencyRisk || "low";
  const loudnessConsistency = deliveryAnalysis?.delivery?.loudnessConsistency || "stable";
  const intensityLevel = deliveryAnalysis?.delivery?.intensity || "moderate";
  const stableDelivery =
    rushedRisk === "low"
    && hesitationRisk === "low"
    && fragmentationRisk === "low"
    && pacingStabilityRisk === "low"
    && sharpnessRisk === "low";

  let clarity = 4;
  let politenessScore = 5;
  let warmthScore = 4;
  let confidence = 5;
  let respectfulness = 5;
  let empathyScore = 3;
  let professionalism = 5;
  let accuracy = 6;
  let accuracyConfidence = 5;
  let ownershipScore = 3;
  let helpfulness = 4;
  let directness = 4;
  let explanationQuality = 3;
  let nextStepQuality = 3;
  let escalationJudgment = 5;

  if (politeness) politenessScore += 2;
  if (warmth) warmthScore += 3;
  if (respectful) respectfulness += 2;
  if (empathy) empathyScore += 4;
  if (ownership) ownershipScore += 4;
  if (professional) professionalism += 2;
  if (verification || explanation) clarity += 2;
  if (nextStep) nextStepQuality += 4;
  if (timeline) nextStepQuality += 2;
  if (wordCount >= 10) directness += 2;
  if (ownership && !hedging) confidence += 2;
  if (verification) explanationQuality += 2;
  if (explanation) explanationQuality += 3;
  if (verification || explanation) helpfulness += 2;
  if (ownership && nextStep) helpfulness += 3;
  if (timeline) clarity += 1;
  if (nextStep) clarity += 1;
  if (discovery || recommendation || safetyAction || direction) helpfulness += 2;
  if (scenario.department === "golf" && discovery) warmthScore += 1;
  if (scenario.department === "mod_emergency" && (safetyAction || direction)) professionalism += 2;

  if (hedging) {
    confidence -= 2;
    accuracyConfidence -= 2;
  }
  if (vagueness) {
    clarity -= 2;
    helpfulness -= 2;
    confidence -= 1;
  }
  if (dismissive) {
    respectfulness -= 4;
    empathyScore -= 3;
    professionalism -= 2;
    helpfulness -= 2;
  }
  if (rude) {
    respectfulness -= 5;
    politenessScore -= 4;
    professionalism -= 3;
    helpfulness -= 3;
  }
  if (blameShifting) {
    ownershipScore -= 4;
    respectfulness -= 2;
    helpfulness -= 2;
  }
  if (passiveAggression) {
    respectfulness -= 3;
    professionalism -= 2;
  }
  if (deadEndLanguage) {
    ownershipScore -= 4;
    helpfulness -= 4;
    professionalism -= 2;
  }
  if (robotic) {
    warmthScore -= 2;
    empathyScore -= 1;
  }
  if (patronizing) {
    respectfulness -= 2;
    warmthScore -= 2;
    professionalism -= 1;
  }
  if (repetitiveResponse) {
    clarity -= 1;
    helpfulness -= 1;
    professionalism -= 1;
  }
  if (rushedRisk === "medium") {
    clarity -= 1;
    professionalism -= 1;
  }
  if (rushedRisk === "high") {
    clarity -= 2;
    professionalism -= 1;
    helpfulness -= 1;
    directness -= 1;
  }
  if (hesitationRisk === "medium") {
    confidence -= 1;
  }
  if (hesitationRisk === "high") {
    confidence -= 2;
    clarity -= 1;
    directness -= 1;
  }
  if (fragmentationRisk === "medium") {
    clarity -= 1;
    professionalism -= 1;
  }
  if (fragmentationRisk === "high") {
    clarity -= 2;
    professionalism -= 1;
    directness -= 1;
  }
  if (disfluencyRisk === "medium") {
    confidence -= 1;
  }
  if (disfluencyRisk === "high") {
    confidence -= 2;
    clarity -= 1;
  }
  if (pacingStabilityRisk === "medium") {
    professionalism -= 1;
  }
  if (pacingStabilityRisk === "high") {
    professionalism -= 2;
    clarity -= 1;
  }
  if (interruptionRisk === "high") {
    respectfulness -= 1;
  }
  if (sharpnessRisk === "medium") {
    warmthScore -= 1;
  }
  if (sharpnessRisk === "high") {
    warmthScore -= 2;
    respectfulness -= 1;
    professionalism -= 1;
  }
  if (loudnessConsistency === "erratic") {
    professionalism -= 1;
  }
  if (stableDelivery) {
    professionalism += 1;
    directness += 1;
    if (intensityLevel !== "high") {
      warmthScore += 1;
    }
  }
  if (overTalking) {
    directness -= 2;
    clarity -= 1;
  }
  if (contradiction) {
    accuracy -= 3;
    accuracyConfidence -= 2;
  }

  if (scenario.scenario_family === "billing_confusion" && /call your bank/i.test(text)) accuracy = 1;
  if (scenario.scenario_family === "unsafe_equipment_report" && /still let people use it/i.test(lower)) accuracy = 1;
  if (scenario.department === "mod_emergency" && !safetyAction && !direction && /policy|report/i.test(lower)) accuracy -= 2;
  if (scenario.department === "golf" && recommendation && !discovery) helpfulness -= 1;

  const setExpectationsClearly = nextStep && timeline;
  const baseAnsweredQuestion = expectation.needsFacts
    ? verification || explanation || safetyAction || discovery
    : nextStep || recommendation || discovery || explanation;
  const addressedLatestConcern = addressesLatestQuestion({
    latestCustomerMessage: context.latestCustomerMessage,
    employeeMessage: text,
    verification,
    explanation,
    nextStep,
    timeline,
    ownership,
    explicitManager,
    discovery,
    recommendation,
    direction,
    safetyAction,
  });
  const answeredQuestion = baseAnsweredQuestion
    && addressedLatestConcern
    && !(
      vagueness
      && !setExpectationsClearly
      && !safetyAction
      && !direction
      && !recommendation
      && !discovery
      && !(verification && explanation)
    );
  const avoidedQuestion = !answeredQuestion && (vagueness || deadEndLanguage || blameShifting || wordCount < 7 || !addressedLatestConcern);
  const tookOwnership = ownership;
  const escalatedAppropriately = scenario.department === "mod_emergency"
    ? explicitManager || safetyAction || direction
    : explicitManager && (scenario.critical_errors.some((item) => /manager|supervisor/i.test(item)) || rude || deadEndLanguage);
  const madeCustomerFeelHeard = (empathyScore >= 6 || respectfulness >= 7) && !dismissive && !rude;
  const fakeConfidence = confidence >= 7 && accuracy <= 4;
  const policyMisuse = /policy/i.test(text) && (scenario.department === "mod_emergency" ? !safetyAction : deadEndLanguage || !nextStep);
  const disrespect = dismissive || rude || passiveAggression || blameShifting || patronizing;

  const respectImpact = clamp(Math.round((respectfulness + politenessScore + professionalism - 15) / 2), -10, 10);
  const heardImpact = clamp(Math.round((empathyScore + clarity + ownershipScore - 12) / 2), -10, 10);

  const strengths = unique([
    empathy ? "acknowledged the concern" : "",
    ownership ? "took ownership" : "",
    verification ? "verified the facts" : "",
    explanation ? "explained what is happening" : "",
    nextStep ? "gave a concrete next step" : "",
    timeline ? "set expectations clearly" : "",
    discovery ? "used discovery" : "",
    recommendation ? "made a recommendation" : "",
    safetyAction ? "led with safety control" : "",
    direction ? "gave direct instructions" : "",
    madeCustomerFeelHeard ? "made the customer feel heard" : "",
  ]);

  const issues = unique([
    dismissive ? "sounded dismissive" : "",
    rude ? "sounded rude" : "",
    blameShifting ? "shifted blame away from the club" : "",
    vagueness ? "was vague about what happens next" : "",
    deadEndLanguage ? "used dead-end language" : "",
    fakeConfidence ? "sounded confident without enough substance" : "",
    policyMisuse ? "leaned on policy instead of solving the real issue" : "",
    contradiction ? "contradicted a prior promise" : "",
    patronizing ? "sounded patronizing" : "",
    repetitiveResponse ? "repeated the same kind of answer instead of moving the issue forward" : "",
    robotic ? "sounded robotic" : "",
    rushedRisk === "high" ? "delivery sounded rushed" : "",
    hesitationRisk === "high" ? "delivery sounded hesitant" : "",
    fragmentationRisk === "high" ? "delivery sounded fragmented" : "",
    pacingStabilityRisk === "high" ? "delivery pacing was unstable" : "",
    sharpnessRisk === "high" ? "delivery sounded sharp or clipped" : "",
    disfluencyRisk === "high" ? "delivery sounded disfluent or restart-heavy" : "",
    overTalking ? "over-talked instead of simplifying the answer" : "",
    !answeredQuestion ? "did not really answer the customer" : "",
    !addressedLatestConcern ? "did not respond to what the customer just asked" : "",
    !setExpectationsClearly && expectation.needsNextStep ? "did not set expectations clearly" : "",
    !tookOwnership && !explicitManager ? "did not clearly own the next step" : "",
  ]);

  const toneLabels = deriveToneLabels({
    dismissive,
    rude,
    passiveAggressive: passiveAggression,
    robotic: robotic || repetitiveResponse,
    respectful,
    warm: warmth,
    confident: confidence >= 7 && !hedging,
    uncertain: hedging || vagueness,
    directive: direction || safetyAction,
  });

  const summary = strengths[0]
    ? `${strengths[0]}${issues[0] ? `, but ${issues[0]}` : ""}`
    : issues[0] || "response was mixed and still left gaps";

  const serviceSummary = [
    madeCustomerFeelHeard ? "customer likely felt heard" : "customer likely still feels unconvinced",
    setExpectationsClearly ? "expectations were set clearly" : "expectations were still fuzzy",
    tookOwnership ? "employee took ownership" : "employee did not clearly own the issue",
    stableDelivery ? "delivery sounded steady" : "delivery likely affected how the answer landed",
  ].join("; ");

  return {
    clarity: clamp(clarity),
    politeness: clamp(politenessScore),
    warmth: clamp(warmthScore),
    confidence: clamp(confidence),
    respectfulness: clamp(respectfulness),
    empathy: clamp(empathyScore),
    professionalism: clamp(professionalism),
    accuracy: clamp(accuracy),
    accuracyConfidence: clamp(accuracyConfidence),
    ownership: clamp(ownershipScore),
    helpfulness: clamp(helpfulness),
    directness: clamp(directness),
    explanationQuality: clamp(explanationQuality),
    nextStepQuality: clamp(nextStepQuality),
    respectImpact,
    heardImpact,
    escalationJudgment: clamp(
      escalationJudgment
        + (escalatedAppropriately ? 2 : 0)
        + (scenario.department === "mod_emergency" && (safetyAction || direction) ? 1 : 0)
        - (explicitManager && !escalatedAppropriately ? 2 : 0),
    ),
    toneLabels,
    strengths,
    issues,
    serviceSummary,
    answeredQuestion,
    avoidedQuestion,
    soundedDismissive: dismissive,
    soundedRude: rude,
    setExpectationsClearly,
    tookOwnership,
    escalatedAppropriately,
    madeCustomerFeelHeard,
    contradictionDetected: contradiction,
    vaguenessDetected: vagueness,
    fakeConfidence,
    blameShifting,
    policyMisuse,
    overTalking,
    deadEndLanguage,
    disrespect,
    passiveAggression,
    roboticPhrasing: robotic,
    explicitManagerMention: explicitManager,
    explicitDisrespect: disrespect,
    explicitOwnership: ownership,
    explicitNextStep: nextStep,
    explicitTimeline: timeline,
    explicitVerification: verification,
    explicitExplanation: explanation,
    explicitSafetyControl: safetyAction,
    explicitDirection: direction,
    explicitDiscovery: discovery,
    explicitRecommendation: recommendation,
    explicitClosureAttempt,
    likelySolved: helpfulness >= 7 && accuracy >= 6 && (nextStep || direction || recommendation || setExpectationsClearly),
    likelyStalled: helpfulness <= 4 || deadEndLanguage || vagueness,
    summary,
  };
}

export function mergeLlmAssistedAnalysis(
  heuristic: EmployeeUtteranceAnalysis,
  llm?: LlmAssistedUtteranceAssessment | null,
): EmployeeUtteranceAnalysis {
  if (!llm) return heuristic;

  const merged: EmployeeUtteranceAnalysis = {
    ...heuristic,
    clarity: clamp(llm.clarity ?? heuristic.clarity),
    politeness: clamp(llm.politeness ?? heuristic.politeness),
    warmth: clamp(llm.warmth ?? heuristic.warmth),
    confidence: clamp(llm.confidence ?? heuristic.confidence),
    respectfulness: clamp(llm.respectfulness ?? heuristic.respectfulness),
    empathy: clamp(llm.empathy ?? heuristic.empathy),
    professionalism: clamp(llm.professionalism ?? heuristic.professionalism),
    accuracyConfidence: clamp(llm.accuracyConfidence ?? heuristic.accuracyConfidence),
    answeredQuestion: llm.answeredQuestion ?? heuristic.answeredQuestion,
    avoidedQuestion: llm.avoidedQuestion ?? heuristic.avoidedQuestion,
    soundedDismissive: llm.soundedDismissive ?? heuristic.soundedDismissive,
    soundedRude: llm.soundedRude ?? heuristic.soundedRude,
    setExpectationsClearly: llm.setExpectationsClearly ?? heuristic.setExpectationsClearly,
    tookOwnership: llm.tookOwnership ?? heuristic.tookOwnership,
    escalatedAppropriately: llm.escalatedAppropriately ?? heuristic.escalatedAppropriately,
    madeCustomerFeelHeard: llm.madeCustomerFeelHeard ?? heuristic.madeCustomerFeelHeard,
    contradictionDetected: llm.contradictionDetected ?? heuristic.contradictionDetected,
    vaguenessDetected: llm.vaguenessDetected ?? heuristic.vaguenessDetected,
    fakeConfidence: llm.fakeConfidence ?? heuristic.fakeConfidence,
    blameShifting: llm.blameShifting ?? heuristic.blameShifting,
    policyMisuse: llm.policyMisuse ?? heuristic.policyMisuse,
    overTalking: llm.overTalking ?? heuristic.overTalking,
    deadEndLanguage: llm.deadEndLanguage ?? heuristic.deadEndLanguage,
    disrespect: llm.disrespect ?? heuristic.disrespect,
    passiveAggression: llm.passiveAggression ?? heuristic.passiveAggression,
    roboticPhrasing: llm.roboticPhrasing ?? heuristic.roboticPhrasing,
  };

  merged.issues = unique([...merged.issues, ...(llm.notes || [])]);
  merged.summary = merged.issues[0] ? `${merged.summary}; ${merged.issues[0]}` : merged.summary;
  return merged;
}

export function buildUtteranceAnalysisPromptPayload(params: {
  message: string;
  scenario: ScenarioDirectorResult;
  context?: EmployeeUtteranceContext;
  heuristic: EmployeeUtteranceAnalysis;
}) {
  return {
    scenario: {
      department: params.scenario.department,
      scenario_family: params.scenario.scenario_family,
      customer_goal: params.context?.scenarioGoal || params.scenario.scenario_family,
      situation_summary: params.scenario.situation_summary,
      opening_line: params.scenario.opening_line,
    },
    context: {
      latest_customer_message: params.context?.latestCustomerMessage || "",
      prior_promises_made: params.context?.priorPromisesMade || [],
      previous_employee_messages: params.context?.previousEmployeeMessages || [],
      delivery_analysis: params.context?.deliveryAnalysis || null,
    },
    employee_message: params.message,
    heuristic_analysis: params.heuristic,
    rubric: {
      score_range: "0-10",
      focus: [
        "clarity",
        "politeness",
        "warmth",
        "confidence",
        "respectfulness",
        "empathy",
        "professionalism",
        "accuracy confidence",
        "ownership",
        "expectation setting",
        "whether the question was actually answered",
      ],
      flags: [
        "dismissive",
        "rude",
        "vagueness",
        "fake confidence",
        "blame shifting",
        "policy misuse",
        "over-talking",
        "dead-end language",
        "disrespect",
        "passive aggression",
        "robotic phrasing",
      ],
    },
  };
}

export function mergeEmployeeAnalyses(analyses: EmployeeUtteranceAnalysis[]): EmployeeUtteranceAnalysis {
  if (analyses.length === 0) {
    return buildUtteranceAnalysisDefaults();
  }

  const averageBy = (key: keyof EmployeeUtteranceAnalysis) => {
    const numericValues = analyses.map((analysis) => analysis[key]).filter((value): value is number => typeof value === "number");
    if (numericValues.length === 0) return 0;
    return clamp(average(numericValues));
  };

  const strengths = unique(analyses.flatMap((analysis) => analysis.strengths)).slice(0, 8);
  const issues = unique(analyses.flatMap((analysis) => analysis.issues)).slice(0, 8);
  const toneLabels = unique(analyses.flatMap((analysis) => analysis.toneLabels));

  return {
    clarity: averageBy("clarity"),
    politeness: averageBy("politeness"),
    warmth: averageBy("warmth"),
    confidence: averageBy("confidence"),
    respectfulness: averageBy("respectfulness"),
    empathy: averageBy("empathy"),
    professionalism: averageBy("professionalism"),
    accuracy: averageBy("accuracy"),
    accuracyConfidence: averageBy("accuracyConfidence"),
    ownership: averageBy("ownership"),
    helpfulness: averageBy("helpfulness"),
    directness: averageBy("directness"),
    explanationQuality: averageBy("explanationQuality"),
    nextStepQuality: averageBy("nextStepQuality"),
    respectImpact: averageBy("respectImpact"),
    heardImpact: averageBy("heardImpact"),
    escalationJudgment: averageBy("escalationJudgment"),
    toneLabels: toneLabels.length > 0 ? toneLabels : ["neutral"],
    strengths,
    issues,
    serviceSummary: strengths[0]
      ? `${strengths[0]}${issues[0] ? `, but ${issues[0]}` : ""}`
      : issues[0] || "conversation progress is still mixed",
    answeredQuestion: analyses.some((analysis) => analysis.answeredQuestion),
    avoidedQuestion: analyses.every((analysis) => analysis.avoidedQuestion),
    soundedDismissive: analyses.some((analysis) => analysis.soundedDismissive),
    soundedRude: analyses.some((analysis) => analysis.soundedRude),
    setExpectationsClearly: analyses.some((analysis) => analysis.setExpectationsClearly),
    tookOwnership: analyses.some((analysis) => analysis.tookOwnership),
    escalatedAppropriately: analyses.some((analysis) => analysis.escalatedAppropriately),
    madeCustomerFeelHeard: analyses.some((analysis) => analysis.madeCustomerFeelHeard),
    contradictionDetected: analyses.some((analysis) => analysis.contradictionDetected),
    vaguenessDetected: analyses.some((analysis) => analysis.vaguenessDetected),
    fakeConfidence: analyses.some((analysis) => analysis.fakeConfidence),
    blameShifting: analyses.some((analysis) => analysis.blameShifting),
    policyMisuse: analyses.some((analysis) => analysis.policyMisuse),
    overTalking: analyses.some((analysis) => analysis.overTalking),
    deadEndLanguage: analyses.some((analysis) => analysis.deadEndLanguage),
    disrespect: analyses.some((analysis) => analysis.disrespect),
    passiveAggression: analyses.some((analysis) => analysis.passiveAggression),
    roboticPhrasing: analyses.some((analysis) => analysis.roboticPhrasing),
    explicitManagerMention: analyses.some((analysis) => analysis.explicitManagerMention),
    explicitDisrespect: analyses.some((analysis) => analysis.explicitDisrespect),
    explicitOwnership: analyses.some((analysis) => analysis.explicitOwnership),
    explicitNextStep: analyses.some((analysis) => analysis.explicitNextStep),
    explicitTimeline: analyses.some((analysis) => analysis.explicitTimeline),
    explicitVerification: analyses.some((analysis) => analysis.explicitVerification),
    explicitExplanation: analyses.some((analysis) => analysis.explicitExplanation),
    explicitSafetyControl: analyses.some((analysis) => analysis.explicitSafetyControl),
    explicitDirection: analyses.some((analysis) => analysis.explicitDirection),
    explicitDiscovery: analyses.some((analysis) => analysis.explicitDiscovery),
    explicitRecommendation: analyses.some((analysis) => analysis.explicitRecommendation),
    explicitClosureAttempt: analyses.some((analysis) => analysis.explicitClosureAttempt),
    likelySolved: analyses.some((analysis) => analysis.likelySolved),
    likelyStalled: analyses.every((analysis) => analysis.likelyStalled),
    summary: strengths[0]
      ? `${strengths[0]}${issues[0] ? `, but ${issues[0]}` : ""}`
      : issues[0] || "conversation progress is still mixed",
  };
}
