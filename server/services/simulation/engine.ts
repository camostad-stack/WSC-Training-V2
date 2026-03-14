import type { CustomerReplyResult, ScenarioDirectorResult, StateUpdateResult, TranscriptTurn } from "../ai/contracts";
import { customerReplyResultSchema, stateUpdateResultSchema } from "../ai/contracts";
import { analyzeEmployeeUtterance, mergeEmployeeAnalyses } from "./analysis";
import { summarizeGoalProgress } from "./goals";
import { buildCustomerActorReply } from "./customer-actor";
import { buildInitialHiddenConversationState, reduceHiddenConversationState } from "./state-manager";
import type { SimulationPromptContext, StateUpdateWithRuntimeFields, VoiceDeliveryAnalysis } from "./types";
import { evaluateConversationTerminalState, isTerminalConversationState } from "@shared/conversation-outcome";

function summarizeState(state: Partial<StateUpdateResult> | undefined) {
  if (!state) return "No prior state yet.";
  return [
    `emotion=${state.emotion_state || "unknown"}`,
    `trust=${state.trust_level ?? "--"}`,
    `clarity=${state.issue_clarity ?? "--"}`,
    `goal_status=${(state as any).goal_status || "unknown"}`,
    `strategy=${(state as any).customer_strategy || "unknown"}`,
    `next_behavior=${(state as any).likely_next_behavior || "unknown"}`,
  ].join(", ");
}

function findLatestCustomerMessage(transcript: TranscriptTurn[]) {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    if (transcript[index]?.role === "customer") {
      return transcript[index]?.message || "";
    }
  }
  return "";
}

function extractPriorPromisesMade(employeeMessages: string[]) {
  return employeeMessages.filter((message) => (
    /\b(i will|i'll|i am going to|i'm going to|next step|manager|refund|credit|confirmation|update|this afternoon|today|minutes|hours|before you leave)\b/i.test(message)
  ));
}

export function buildSimulationPromptContext(params: {
  scenario: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  priorState?: Partial<StateUpdateResult>;
  employeeResponse: string;
  deliveryAnalysis?: VoiceDeliveryAnalysis;
}): SimulationPromptContext {
  const transcriptAlreadyIncludesLatestEmployeeTurn = params.transcript[params.transcript.length - 1]?.role === "employee";
  const priorTranscript = transcriptAlreadyIncludesLatestEmployeeTurn ? params.transcript.slice(0, -1) : params.transcript;
  const priorEmployeeMessages = priorTranscript.filter((turn) => turn.role === "employee").map((turn) => turn.message);
  const latestCustomerMessage = findLatestCustomerMessage(priorTranscript);
  const priorPromisesMade = extractPriorPromisesMade(priorEmployeeMessages);
  const currentTurnNumber = transcriptAlreadyIncludesLatestEmployeeTurn
    ? priorEmployeeMessages.length + 1
    : priorEmployeeMessages.length + 1;

  const priorAnalyses = priorEmployeeMessages.map((message) => analyzeEmployeeUtterance(message, params.scenario));
  const priorAnalysis = mergeEmployeeAnalyses(priorAnalyses);
  const currentAnalysis = analyzeEmployeeUtterance(params.employeeResponse, params.scenario, {
    latestCustomerMessage,
    priorPromisesMade,
    previousEmployeeMessages: priorEmployeeMessages,
    scenarioGoal: params.scenario.scenario_family,
    deliveryAnalysis: params.deliveryAnalysis,
  });
  const aggregateAnalysis = mergeEmployeeAnalyses([...priorAnalyses, currentAnalysis]);
  const progress = summarizeGoalProgress({
    scenario: params.scenario,
    currentTurnNumber,
    priorAnalysis,
    aggregateAnalysis,
    hiddenFacts: params.scenario.hidden_facts,
  });

  return {
    currentTurnNumber,
    employeeAnalysis: currentAnalysis,
    aggregateAnalysis,
    progress,
    priorStateSummary: summarizeState(params.priorState),
    deliveryAnalysis: params.deliveryAnalysis,
    latestCustomerMessage,
    priorPromisesMade,
  };
}

function buildCompletionReason(updatedState: StateUpdateWithRuntimeFields) {
  const validation = evaluateConversationTerminalState(updatedState);
  if (validation.isTerminal && updatedState.terminal_outcome_state === "RESOLVED") {
    return "resolved";
  }
  if (validation.isTerminal && updatedState.terminal_outcome_state === "ESCALATED") {
    return "escalated";
  }
  if (validation.isTerminal && updatedState.terminal_outcome_state === "ABANDONED") {
    return "abandoned";
  }
  if (validation.isTerminal && updatedState.terminal_outcome_state === "TIMED_OUT") {
    return "timed_out";
  }
  if (updatedState.premature_closure_detected) {
    return "premature_closure_attempt";
  }
  return "";
}

export function simulateCustomerTurn(params: {
  scenario: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  priorState?: Partial<StateUpdateResult>;
  employeeResponse: string;
  deliveryAnalysis?: VoiceDeliveryAnalysis;
}): { customerReply: CustomerReplyResult; stateUpdate: StateUpdateResult; promptContext: SimulationPromptContext } {
  const promptContext = buildSimulationPromptContext(params);
  const priorState = stateUpdateResultSchema.partial().safeParse(params.priorState).success
    ? ({ ...buildInitialHiddenConversationState(params.scenario), ...params.priorState } as StateUpdateWithRuntimeFields)
    : buildInitialHiddenConversationState(params.scenario);

  const updatedState = reduceHiddenConversationState({
    scenario: params.scenario,
    priorState,
    currentTurnNumber: promptContext.currentTurnNumber,
    analysis: promptContext.employeeAnalysis,
    progress: promptContext.progress,
    transcript: params.transcript,
    latestCustomerMessage: promptContext.latestCustomerMessage,
    employeeMessage: params.employeeResponse,
  });

  const customerReply = buildCustomerActorReply({
    scenario: params.scenario,
    state: updatedState,
    progress: promptContext.progress,
    analysis: promptContext.employeeAnalysis,
    priorState,
    transcript: params.transcript,
  });

  return {
    customerReply: customerReplyResultSchema.parse({
      customer_reply: customerReply,
      updated_emotion: updatedState.emotion_state,
      trust_level: updatedState.trust_level,
      issue_clarity: updatedState.issue_clarity,
      manager_needed: updatedState.escalation_required,
      scenario_complete: isTerminalConversationState(updatedState),
      completion_reason: buildCompletionReason(updatedState),
      new_hidden_fact_revealed: promptContext.progress.hiddenFactRevealed,
      director_notes: {
        employee_showed_empathy: updatedState.employee_flags.showed_empathy,
        employee_was_clear: updatedState.employee_flags.answered_directly,
        employee_used_correct_policy: updatedState.employee_flags.used_correct_policy,
        employee_took_ownership: updatedState.employee_flags.took_ownership,
        employee_should_be_pushed_harder: !isTerminalConversationState(updatedState) && !updatedState.employee_flags.critical_error,
      },
    }),
    stateUpdate: stateUpdateResultSchema.parse(updatedState),
    promptContext,
  };
}

export function buildDefaultConversationState(scenario: ScenarioDirectorResult, priorState?: Partial<StateUpdateResult>) {
  return stateUpdateResultSchema.parse({
    ...buildInitialHiddenConversationState(scenario),
    ...priorState,
  });
}

export function formatPromptContext(context: SimulationPromptContext) {
  return JSON.stringify({
    turn_number: context.currentTurnNumber,
    employee_analysis: context.employeeAnalysis,
    aggregate_analysis: context.aggregateAnalysis,
    delivery_analysis: context.deliveryAnalysis || null,
    latest_customer_message: context.latestCustomerMessage || null,
    prior_promises_made: context.priorPromisesMade || [],
    goal: {
      title: context.progress.goalTitle,
      description: context.progress.goalDescription,
      met_before: context.progress.metBefore,
      met_after: context.progress.metAfter,
      newly_completed: context.progress.newlyCompleted,
      missing_after: context.progress.missingAfter,
      next_missing: context.progress.nextMissing?.label || null,
      hidden_fact_revealed: context.progress.hiddenFactRevealed,
    },
    prior_state_summary: context.priorStateSummary,
  }, null, 2);
}
