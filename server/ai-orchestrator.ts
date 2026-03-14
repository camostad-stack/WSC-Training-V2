/**
 * WSC AI orchestration public surface.
 * Kept as a compatibility wrapper while the implementation lives in server/services/ai.
 */
export {
  generateScenario,
  getAdaptiveDifficulty,
  runPostSessionEvaluation,
  updateEmployeeProfile,
  type EvaluationPipelineResult,
} from "./services/ai/pipeline";

export { processEmployeeTurn } from "./services/customer-runtime";

export { AI_SERVICE_REGISTRY as PROMPT_REGISTRY } from "./services/ai/registry";
export { runPrompt as callPrompt } from "./services/ai/prompt-runner";

export type {
  AdaptiveDifficultyResult,
  CoachingResult,
  CustomerReplyResult,
  EvaluationResult,
  ManagerDebriefResult,
  PolicyGroundingResult,
  ProfileUpdateResult,
  ScenarioDirectorResult,
  SessionQualityResult,
  StateUpdateResult,
  VisibleBehaviorResult,
} from "./services/ai/contracts";
