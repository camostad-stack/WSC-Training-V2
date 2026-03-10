import {
  ADAPTIVE_DIFFICULTY_SYSTEM,
  CUSTOMER_SIMULATOR_SYSTEM,
  EMPLOYEE_PROFILE_UPDATER_SYSTEM,
  EMPLOYEE_COACH_SYSTEM,
  EVALUATOR_SYSTEM,
  MANAGER_DEBRIEF_SYSTEM,
  POLICY_GROUNDING_SYSTEM,
  SCENARIO_DIRECTOR_SYSTEM,
  SESSION_QUALITY_SYSTEM,
  STATE_MANAGER_SYSTEM,
  VIDEO_ANALYZER_SYSTEM,
} from "../../prompts";
import {
  adaptiveDifficultyResultSchema,
  coachingResultSchema,
  customerReplyResultSchema,
  evaluationResultSchema,
  managerDebriefResultSchema,
  policyGroundingResultSchema,
  profileUpdateResultSchema,
  responseFormats,
  scenarioDirectorResultSchema,
  sessionQualityResultSchema,
  stateUpdateResultSchema,
  visibleBehaviorResultSchema,
} from "./contracts";

export type AiServiceName =
  | "scenarioDirector"
  | "statefulCustomerActor"
  | "conversationStateUpdater"
  | "policyRetriever"
  | "policyGrounding"
  | "visibleBehaviorEvaluator"
  | "lowEffortDetector"
  | "interactionEvaluator"
  | "coachingGenerator"
  | "managerDebriefGenerator"
  | "employeeProfileUpdater"
  | "adaptiveDifficultyEngine";

export interface AiServiceDefinition<T = unknown> {
  name: AiServiceName;
  version: string;
  kind: "llm" | "service";
  purpose: string;
  systemPrompt?: string;
  responseFormat?: unknown;
  validator?: { parse: (value: unknown) => T };
}

export const AI_SERVICE_REGISTRY: Record<AiServiceName, AiServiceDefinition> = {
  scenarioDirector: {
    name: "scenarioDirector",
    version: "3.0.0",
    kind: "llm",
    purpose: "Generate structured scenario cards with branch logic and completion rules.",
    systemPrompt: SCENARIO_DIRECTOR_SYSTEM,
    responseFormat: responseFormats.scenarioDirector,
    validator: scenarioDirectorResultSchema,
  },
  statefulCustomerActor: {
    name: "statefulCustomerActor",
    version: "3.0.0",
    kind: "llm",
    purpose: "Play the customer turn-by-turn using scenario state and transcript context.",
    systemPrompt: CUSTOMER_SIMULATOR_SYSTEM,
    responseFormat: responseFormats.statefulCustomerActor,
    validator: customerReplyResultSchema,
  },
  conversationStateUpdater: {
    name: "conversationStateUpdater",
    version: "3.0.0",
    kind: "llm",
    purpose: "Maintain structured turn state for replay, scoring, and future voice orchestration.",
    systemPrompt: STATE_MANAGER_SYSTEM,
    responseFormat: responseFormats.conversationStateUpdater,
    validator: stateUpdateResultSchema,
  },
  policyRetriever: {
    name: "policyRetriever",
    version: "1.0.0",
    kind: "service",
    purpose: "Load the right active policy snippets for a scenario or review context.",
  },
  policyGrounding: {
    name: "policyGrounding",
    version: "3.0.0",
    kind: "llm",
    purpose: "Ground employee behavior against retrieved WSC policy context.",
    systemPrompt: POLICY_GROUNDING_SYSTEM,
    responseFormat: responseFormats.policyGrounding,
    validator: policyGroundingResultSchema,
  },
  visibleBehaviorEvaluator: {
    name: "visibleBehaviorEvaluator",
    version: "1.0.0",
    kind: "service",
    purpose: "Assess whether media can support observable behavior scoring and leave room for live voice/video later.",
    systemPrompt: VIDEO_ANALYZER_SYSTEM,
    validator: visibleBehaviorResultSchema,
  },
  lowEffortDetector: {
    name: "lowEffortDetector",
    version: "3.0.0",
    kind: "llm",
    purpose: "Detect incomplete, low-effort, or unreliable sessions before scoring is trusted.",
    systemPrompt: SESSION_QUALITY_SYSTEM,
    responseFormat: responseFormats.lowEffortDetector,
    validator: sessionQualityResultSchema,
  },
  interactionEvaluator: {
    name: "interactionEvaluator",
    version: "3.0.0",
    kind: "llm",
    purpose: "Produce evidence-based scoring, pass/fail, and readiness output.",
    systemPrompt: EVALUATOR_SYSTEM,
    responseFormat: responseFormats.interactionEvaluator,
    validator: evaluationResultSchema,
  },
  coachingGenerator: {
    name: "coachingGenerator",
    version: "3.0.0",
    kind: "llm",
    purpose: "Generate employee coaching from the scored interaction.",
    systemPrompt: EMPLOYEE_COACH_SYSTEM,
    responseFormat: responseFormats.coachingGenerator,
    validator: coachingResultSchema,
  },
  managerDebriefGenerator: {
    name: "managerDebriefGenerator",
    version: "3.0.0",
    kind: "llm",
    purpose: "Generate manager-facing follow-up guidance and risk signals.",
    systemPrompt: MANAGER_DEBRIEF_SYSTEM,
    responseFormat: responseFormats.managerDebriefGenerator,
    validator: managerDebriefResultSchema,
  },
  employeeProfileUpdater: {
    name: "employeeProfileUpdater",
    version: "3.0.0",
    kind: "llm",
    purpose: "Roll session results into the employee capability profile.",
    systemPrompt: EMPLOYEE_PROFILE_UPDATER_SYSTEM,
    responseFormat: responseFormats.employeeProfileUpdater,
    validator: profileUpdateResultSchema,
  },
  adaptiveDifficultyEngine: {
    name: "adaptiveDifficultyEngine",
    version: "1.0.0",
    kind: "llm",
    purpose: "Recommend next scenario difficulty based on profile and recent sessions.",
    systemPrompt: ADAPTIVE_DIFFICULTY_SYSTEM,
    responseFormat: responseFormats.adaptiveDifficultyEngine,
    validator: adaptiveDifficultyResultSchema,
  },
};
