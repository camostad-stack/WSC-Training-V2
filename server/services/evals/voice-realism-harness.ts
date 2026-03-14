import type { StateUpdateResult, TranscriptTurn } from "../ai/contracts";
import { buildVoiceAndRealismEvalDataset, type ConversationEvalCase, type VoiceAndRealismEvalDataset, type VoiceProviderEvalSample, type VoiceRotationEvalCase } from "./voice-realism-datasets";
import { processConversationRuntimeTurn } from "../customer-runtime";
import {
  compareVoiceProvidersForLine,
  createCustomerVoiceCast,
  defaultVoiceCastingService,
  listConfiguredVoiceProviders,
  type VoiceAbComparison,
  type VoiceRenderProvider,
} from "../voice-rendering";
import { evaluateConversationTerminalState } from "@shared/conversation-outcome";

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

const STOCK_PHRASE_PATTERNS = [
  /\bi understand your frustration\b/i,
  /\bthank you for clarifying\b/i,
  /\bi appreciate your patience\b/i,
  /\bi appreciate that\b/i,
  /\blet me know how you(?: would|'d) like to proceed\b/i,
  /\bis there anything else i can help with\b/i,
  /\blet me assist you with that\b/i,
  /\bthat sounds great\b/i,
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leadingKey(text: string, count = 3) {
  return normalize(text).split(" ").filter(Boolean).slice(0, count).join(" ");
}

function countStockPhraseHits(messages: string[]) {
  return messages.reduce((total, message) => (
    total + STOCK_PHRASE_PATTERNS.reduce((hits, pattern) => hits + (pattern.test(message) ? 1 : 0), 0)
  ), 0);
}

function computeLeadReuseRate(messages: string[]) {
  if (messages.length <= 1) return 0;
  let repeated = 0;
  for (let index = 1; index < messages.length; index += 1) {
    if (leadingKey(messages[index]) && leadingKey(messages[index]) === leadingKey(messages[index - 1])) {
      repeated += 1;
    }
  }
  return repeated / (messages.length - 1);
}

function looksLikeSharpReply(message: string) {
  return /\bno\b|\bwait\b|\bhold on\b|\bwho\b|\bwhen\b|\bwhat\b|\bmanager\b|\bdon't\b|\bnot\b/i.test(message);
}

function looksLikeSoftenedReply(message: string) {
  return /\bokay\b|\ball right\b|\bclearer\b|\bbetter\b|\bif that\b|\bwe'?re good\b/i.test(message);
}

function providerAvailable(provider: VoiceRenderProvider) {
  return listConfiguredVoiceProviders().includes(provider);
}

export interface ConversationEvalTurn {
  turnNumber: number;
  employeeMessage: string;
  customerReply: string;
  outcomeState: string;
  isTerminal: boolean;
  complaintStillOpen: boolean;
  trustLevel: number;
  emotionState: string;
  blockedBy: string[];
  unresolvedGapSnapshot: string[];
  prematureClosureBlocked: boolean;
  runtimeEventTypes: string[];
}

export interface ConversationEvalCaseResult {
  id: string;
  title: string;
  expectedTerminalOutcome: ConversationEvalCase["expectation"]["terminalOutcome"];
  actualTerminalOutcome: string;
  passed: boolean;
  validEnding: boolean;
  complaintStayedOpenAsExpected: boolean;
  actorReopenedGap: boolean;
  trustRecovered: boolean;
  deliveryShiftWithTrust: boolean;
  stockPhraseRepeatRate: number;
  leadReuseRate: number;
  conversationRealismScore: number;
  complaintResolutionScore: number;
  prematureClosureResistanceScore: number;
  longCallRealismScore: number;
  finalTerminalReason: string;
  turns: ConversationEvalTurn[];
  finalState: StateUpdateResult;
}

export interface VoiceProviderSampleResult {
  id: string;
  title: string;
  comparisonStatus: "completed" | "skipped";
  comparison?: VoiceAbComparison;
  skippedReason?: string;
}

export interface VoiceRotationSessionResult {
  sessionSeed: string;
  provider: VoiceRenderProvider;
  voiceId: string;
  cadenceFingerprint: string;
  personaArchetype: string;
  openerCadencePattern: string;
  closurePhrasingStyle: string;
}

export interface VoiceRotationCaseResult {
  id: string;
  title: string;
  intentionalRepeatCaller: boolean;
  sameBotFeelScore: number;
  uniqueVoiceCount: number;
  uniqueCadenceCount: number;
  uniquePersonaCount: number;
  voiceReuseRate: number;
  cadenceReuseRate: number;
  exactAdjacentRepeatCount: number;
  repeatCallerConsistency: boolean;
  sessions: VoiceRotationSessionResult[];
}

export interface ProviderAggregateMetric {
  provider: VoiceRenderProvider;
  samples: number;
  avgLatencyMs: number;
  avgNaturalness: number;
  avgPhraseRepetitionRisk: number;
  avgEmotionalRealism: number;
  avgInterruptionRecovery: number;
  fallbackRate: number;
}

export interface VoiceAndRealismEvalReport {
  generatedAt: string;
  summary: {
    conversationRealismScore: number;
    voiceRealismScore: number;
    antiRepetitionScore: number;
    complaintResolutionCorrectness: number;
    prematureClosureResistance: number;
    longCallRealism: number;
    validEndingsRate: number;
    unresolvedGapReopenRate: number;
    stockPhraseRepeatRate: number;
    voiceReuseRate: number;
    cadenceReuseRate: number;
  };
  conversationCases: ConversationEvalCaseResult[];
  voiceProviderSamples: VoiceProviderSampleResult[];
  voiceRotationCases: VoiceRotationCaseResult[];
  providerMetrics: ProviderAggregateMetric[];
  flags: string[];
}

function runConversationCase(caseDef: ConversationEvalCase): ConversationEvalCaseResult {
  const sessionSeed = `${caseDef.id}-session`;
  let transcript: TranscriptTurn[] = [{
    role: "customer",
    message: caseDef.scenario.opening_line,
    emotion: caseDef.scenario.customer_persona.initial_emotion,
  }];
  let priorState: Partial<StateUpdateResult> | undefined;
  const turns: ConversationEvalTurn[] = [];
  const customerReplies: string[] = [];
  const trustLevels: number[] = [];
  let finalState: StateUpdateResult | null = null;
  let finalValidation = evaluateConversationTerminalState(undefined);
  let priorRuntimeEventCount = 0;

  for (let index = 0; index < caseDef.employeeResponses.length; index += 1) {
    const employeeMessage = caseDef.employeeResponses[index];
    const result = processConversationRuntimeTurn({
      scenario: caseDef.scenario,
      transcript,
      employeeResponse: employeeMessage,
      priorState,
      sessionSeed,
      preferredVoiceProvider: caseDef.preferredVoiceProvider,
    });

    finalState = result.stateUpdate;
    finalValidation = result.terminalValidation;
    const runtimeEvents = result.stateUpdate.runtime_events || [];
    const newRuntimeEvents = runtimeEvents.slice(priorRuntimeEventCount);
    const unresolvedGapSnapshot = Array.from(new Set([
      ...(result.stateUpdate.unresolved_customer_questions || []),
      ...(result.stateUpdate.unresolved_subissues || []),
      ...(result.stateUpdate.unmet_completion_criteria || []),
      ...(result.stateUpdate.next_step_missing_fields || []).map((field) => `next step missing ${field}`),
    ]));
    const prematureClosureBlocked = newRuntimeEvents.some((event) => event.type === "premature_closure_attempted");
    const complaintStillOpen = Boolean(result.stateUpdate.complaint_still_open ?? !finalValidation.isTerminal);
    const customerReply = result.customerReply.customer_reply;

    turns.push({
      turnNumber: index + 1,
      employeeMessage,
      customerReply,
      outcomeState: result.stateUpdate.terminal_outcome_state || "ACTIVE",
      isTerminal: finalValidation.isTerminal,
      complaintStillOpen,
      trustLevel: result.stateUpdate.trust_level,
      emotionState: result.stateUpdate.emotion_state,
      blockedBy: finalValidation.blockedBy,
      unresolvedGapSnapshot,
      prematureClosureBlocked,
      runtimeEventTypes: newRuntimeEvents.map((event) => event.type),
    });

    customerReplies.push(customerReply);
    trustLevels.push(result.stateUpdate.trust_level);
    priorState = result.stateUpdate;
    priorRuntimeEventCount = runtimeEvents.length;
    transcript = [
      ...transcript,
      { role: "employee", message: employeeMessage },
      { role: "customer", message: customerReply, emotion: result.stateUpdate.emotion_state },
    ];

    if (finalValidation.isTerminal) {
      break;
    }
  }

  const actualOutcome = finalValidation.outcome;
  const expectedOutcome = caseDef.expectation.terminalOutcome;
  const validEnding = expectedOutcome === null
    ? finalValidation.isTerminal === false
    : finalValidation.isTerminal && actualOutcome === expectedOutcome;
  const complaintStayedOpenAsExpected = caseDef.expectation.minTurnsComplaintOpen
    ? turns.slice(0, caseDef.expectation.minTurnsComplaintOpen).every((turn) => turn.complaintStillOpen)
    : true;
  const actorReopenedGap = caseDef.expectation.requiresPrematureClosureBlock
    ? turns.some((turn) => (
      turn.prematureClosureBlocked
      && (
        turn.runtimeEventTypes.includes("unresolved_gap_reopened")
        || turn.unresolvedGapSnapshot.length > 0
        || /\?|\bstill\b|\bwho\b|\bwhen\b|\bwhat\b/i.test(turn.customerReply)
      )
    ))
    : turns.some((turn) => turn.prematureClosureBlocked || turn.runtimeEventTypes.includes("unresolved_gap_reopened"));
  const minTrust = trustLevels.length > 0 ? Math.min(...trustLevels) : 0;
  const maxTrust = trustLevels.length > 0 ? Math.max(...trustLevels) : 0;
  const finalTrust = trustLevels[trustLevels.length - 1] ?? 0;
  const trustRecovered = caseDef.expectation.shouldRecoverTrust
    ? maxTrust > minTrust && finalTrust > minTrust
    : true;

  const replyLengths = turns.map((turn) => normalize(turn.customerReply).split(" ").filter(Boolean).length);
  const shortestReply = replyLengths.length > 0 ? Math.min(...replyLengths) : 0;
  const longestReply = replyLengths.length > 0 ? Math.max(...replyLengths) : 0;
  const deliveryShiftWithTrust = caseDef.expectation.shouldRecoverTrust
    ? turns.some((turn) => looksLikeSharpReply(turn.customerReply)) && turns.some((turn) => looksLikeSoftenedReply(turn.customerReply))
    : shortestReply < longestReply || turns.some((turn) => looksLikeSharpReply(turn.customerReply));

  const stockPhraseRepeatRate = customerReplies.length > 0
    ? countStockPhraseHits(customerReplies) / customerReplies.length
    : 0;
  const leadReuseRate = computeLeadReuseRate(customerReplies);

  const conversationRealismScore = clamp(
    100
    - Math.round(stockPhraseRepeatRate * 40)
    - Math.round(leadReuseRate * 35)
    + (deliveryShiftWithTrust ? 8 : -8)
    + (actorReopenedGap ? 8 : 0)
    + (validEnding ? 6 : -12),
  );
  const complaintResolutionScore = clamp(validEnding ? 100 : 40);
  const prematureClosureResistanceScore = clamp(
    caseDef.expectation.requiresPrematureClosureBlock
      ? (actorReopenedGap ? 100 : 30)
      : (turns.some((turn) => turn.prematureClosureBlocked) ? 90 : 70),
  );
  const longCallRealismScore = clamp(
    caseDef.category === "long_call_realism"
      ? (complaintStayedOpenAsExpected && !finalValidation.isTerminal ? 100 : 45)
      : 80 + (complaintStayedOpenAsExpected ? 10 : -20),
  );

  return {
    id: caseDef.id,
    title: caseDef.title,
    expectedTerminalOutcome: expectedOutcome,
    actualTerminalOutcome: actualOutcome,
    passed: validEnding && complaintStayedOpenAsExpected && trustRecovered,
    validEnding,
    complaintStayedOpenAsExpected,
    actorReopenedGap,
    trustRecovered,
    deliveryShiftWithTrust,
    stockPhraseRepeatRate: Number(stockPhraseRepeatRate.toFixed(3)),
    leadReuseRate: Number(leadReuseRate.toFixed(3)),
    conversationRealismScore,
    complaintResolutionScore,
    prematureClosureResistanceScore,
    longCallRealismScore,
    finalTerminalReason: finalValidation.terminalReason,
    turns,
    finalState: finalState as StateUpdateResult,
  };
}

function runVoiceProviderSample(
  sample: VoiceProviderEvalSample,
  options: { fetchFn?: typeof fetch },
): Promise<VoiceProviderSampleResult> {
  const available = sample.providers.filter((provider) => options.fetchFn || providerAvailable(provider));
  if (available.length === 0) {
    return Promise.resolve({
      id: sample.id,
      title: sample.title,
      comparisonStatus: "skipped",
      skippedReason: "No configured voice providers available for this comparison.",
    });
  }

  const cast = createCustomerVoiceCast({
    scenario: sample.scenario,
    sessionSeed: sample.sessionSeed,
    preferredProvider: sample.preferredVoiceProvider,
  });

  return compareVoiceProvidersForLine({
    text: sample.text,
    cast,
    providers: available,
    fetchFn: options.fetchFn,
    baselineProvider: available[0],
  }).then((comparison) => ({
    id: sample.id,
    title: sample.title,
    comparisonStatus: "completed",
    comparison,
  }));
}

function runVoiceRotationCase(caseDef: VoiceRotationEvalCase): VoiceRotationCaseResult {
  defaultVoiceCastingService.reset();
  const sessions = caseDef.sessionSeeds.map((sessionSeed) => {
    const cast = createCustomerVoiceCast({
      scenario: caseDef.scenario,
      sessionSeed,
      preferredProvider: caseDef.preferredProvider,
    });

    return {
      sessionSeed,
      provider: cast.provider,
      voiceId: cast.voiceId,
      cadenceFingerprint: cast.cadenceFingerprint,
      personaArchetype: cast.personaArchetype,
      openerCadencePattern: cast.openerCadencePattern,
      closurePhrasingStyle: cast.closurePhrasingStyle,
    };
  });

  const uniqueVoiceCount = new Set(sessions.map((session) => `${session.provider}:${session.voiceId}`)).size;
  const uniqueCadenceCount = new Set(sessions.map((session) => session.cadenceFingerprint)).size;
  const uniquePersonaCount = new Set(sessions.map((session) => session.personaArchetype)).size;
  const exactAdjacentRepeatCount = sessions.reduce((count, session, index) => {
    if (index === 0) return count;
    return count + (
      sessions[index - 1].provider === session.provider
      && sessions[index - 1].voiceId === session.voiceId
      && sessions[index - 1].cadenceFingerprint === session.cadenceFingerprint
        ? 1
        : 0
    );
  }, 0);
  const voiceReuseRate = Number((1 - (uniqueVoiceCount / Math.max(1, sessions.length))).toFixed(3));
  const cadenceReuseRate = Number((1 - (uniqueCadenceCount / Math.max(1, sessions.length))).toFixed(3));
  const repeatCallerConsistency = caseDef.expectRepeatCallerConsistency
    ? uniqueVoiceCount === 1 && uniqueCadenceCount === 1
    : true;

  const sameBotFeelScore = caseDef.expectRepeatCallerConsistency
    ? clamp(repeatCallerConsistency ? 96 : 35)
    : clamp(
      100
      - Math.round(voiceReuseRate * 55)
      - Math.round(cadenceReuseRate * 35)
      - exactAdjacentRepeatCount * 10
      + (repeatCallerConsistency ? 5 : -15),
    );

  return {
    id: caseDef.id,
    title: caseDef.title,
    intentionalRepeatCaller: Boolean(caseDef.expectRepeatCallerConsistency),
    sameBotFeelScore,
    uniqueVoiceCount,
    uniqueCadenceCount,
    uniquePersonaCount,
    voiceReuseRate,
    cadenceReuseRate,
    exactAdjacentRepeatCount,
    repeatCallerConsistency,
    sessions,
  };
}

function aggregateProviderMetrics(samples: VoiceProviderSampleResult[]): ProviderAggregateMetric[] {
  const completed = samples
    .filter((sample): sample is VoiceProviderSampleResult & { comparison: VoiceAbComparison } => sample.comparisonStatus === "completed" && Boolean(sample.comparison))
    .flatMap((sample) => sample.comparison.samples);

  const providers = Array.from(new Set(completed.map((sample) => sample.finalProvider)));
  return providers.map((provider) => {
    const matching = completed.filter((sample) => sample.finalProvider === provider);
    return {
      provider,
      samples: matching.length,
      avgLatencyMs: Math.round(average(matching.map((sample) => sample.diagnostics.latencyMs))),
      avgNaturalness: Math.round(average(matching.map((sample) => sample.diagnostics.quality.naturalness))),
      avgPhraseRepetitionRisk: Math.round(average(matching.map((sample) => sample.diagnostics.quality.phraseRepetitionRisk))),
      avgEmotionalRealism: Math.round(average(matching.map((sample) => sample.diagnostics.quality.emotionalRealism))),
      avgInterruptionRecovery: Math.round(average(matching.map((sample) => sample.diagnostics.quality.interruptionRecovery))),
      fallbackRate: Number((matching.filter((sample) => sample.didFallback).length / Math.max(1, matching.length)).toFixed(3)),
    };
  });
}

export async function runVoiceAndRealismEvalHarness(options: {
  dataset?: VoiceAndRealismEvalDataset;
  fetchFn?: typeof fetch;
} = {}): Promise<VoiceAndRealismEvalReport> {
  const dataset = options.dataset || buildVoiceAndRealismEvalDataset();

  defaultVoiceCastingService.reset();
  const conversationCases = dataset.conversationCases.map(runConversationCase);
  const voiceProviderSamples = await Promise.all(
    dataset.voiceProviderSamples.map((sample) => runVoiceProviderSample(sample, { fetchFn: options.fetchFn })),
  );
  defaultVoiceCastingService.reset();
  const voiceRotationCases = dataset.voiceRotationCases.map(runVoiceRotationCase);
  const providerMetrics = aggregateProviderMetrics(voiceProviderSamples);

  const validEndingsRate = conversationCases.filter((result) => result.validEnding).length / Math.max(1, conversationCases.length);
  const unresolvedGapReopenRate = conversationCases.filter((result) => result.actorReopenedGap).length / Math.max(1, conversationCases.length);
  const stockPhraseRepeatRate = average(conversationCases.map((result) => result.stockPhraseRepeatRate));
  const voiceReuseRate = average(voiceRotationCases.map((result) => result.voiceReuseRate));
  const cadenceReuseRate = average(voiceRotationCases.map((result) => result.cadenceReuseRate));
  const flags = [
    ...conversationCases.filter((result) => !result.passed).map((result) => `Conversation case failed: ${result.id}`),
    ...voiceRotationCases
      .filter((result) => !result.intentionalRepeatCaller && result.sameBotFeelScore < 70)
      .map((result) => `Voice rotation risk: ${result.id}`),
    ...providerMetrics.filter((metric) => metric.fallbackRate > 0.25).map((metric) => `High fallback rate: ${metric.provider}`),
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      conversationRealismScore: Math.round(average(conversationCases.map((result) => result.conversationRealismScore))),
      voiceRealismScore: providerMetrics.length > 0
        ? Math.round(average(providerMetrics.map((metric) => average([
          metric.avgNaturalness,
          100 - metric.avgPhraseRepetitionRisk,
          metric.avgEmotionalRealism,
          metric.avgInterruptionRecovery,
        ]))))
        : 0,
      antiRepetitionScore: Math.round(average([
        ...conversationCases.map((result) => 100 - Math.round(result.leadReuseRate * 100)),
        ...voiceRotationCases.map((result) => result.sameBotFeelScore),
      ])),
      complaintResolutionCorrectness: Math.round(average(conversationCases.map((result) => result.complaintResolutionScore))),
      prematureClosureResistance: Math.round(average(conversationCases.map((result) => result.prematureClosureResistanceScore))),
      longCallRealism: Math.round(average(conversationCases.map((result) => result.longCallRealismScore))),
      validEndingsRate: Number(validEndingsRate.toFixed(3)),
      unresolvedGapReopenRate: Number(unresolvedGapReopenRate.toFixed(3)),
      stockPhraseRepeatRate: Number(stockPhraseRepeatRate.toFixed(3)),
      voiceReuseRate: Number(voiceReuseRate.toFixed(3)),
      cadenceReuseRate: Number(cadenceReuseRate.toFixed(3)),
    },
    conversationCases,
    voiceProviderSamples,
    voiceRotationCases,
    providerMetrics,
    flags,
  };
}

export function formatVoiceAndRealismEvalReport(report: VoiceAndRealismEvalReport) {
  const lines: string[] = [];
  lines.push("Voice + Realism Eval Report");
  lines.push("==========================");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Conversation realism: ${report.summary.conversationRealismScore}/100`);
  lines.push(`Voice realism: ${report.summary.voiceRealismScore}/100`);
  lines.push(`Anti-repetition: ${report.summary.antiRepetitionScore}/100`);
  lines.push(`Complaint-resolution correctness: ${report.summary.complaintResolutionCorrectness}/100`);
  lines.push(`Premature closure resistance: ${report.summary.prematureClosureResistance}/100`);
  lines.push(`Long-call realism: ${report.summary.longCallRealism}/100`);
  lines.push(`Valid endings rate: ${report.summary.validEndingsRate}`);
  lines.push(`Unresolved gap reopen rate: ${report.summary.unresolvedGapReopenRate}`);
  lines.push(`Stock phrase repeat rate: ${report.summary.stockPhraseRepeatRate}`);
  lines.push(`Voice reuse rate: ${report.summary.voiceReuseRate}`);
  lines.push(`Cadence reuse rate: ${report.summary.cadenceReuseRate}`);
  lines.push("");

  lines.push("Conversation Cases");
  lines.push("------------------");
  report.conversationCases.forEach((result) => {
    lines.push(`${result.title} (${result.id})`);
    lines.push(`  Passed: ${result.passed ? "yes" : "no"}`);
    lines.push(`  Expected outcome: ${result.expectedTerminalOutcome ?? "stay open"}`);
    lines.push(`  Actual outcome: ${result.actualTerminalOutcome}`);
    lines.push(`  Terminal reason: ${result.finalTerminalReason}`);
    lines.push(`  Reopened unresolved gaps: ${result.actorReopenedGap ? "yes" : "no"}`);
    lines.push(`  Trust recovered: ${result.trustRecovered ? "yes" : "no"}`);
    lines.push(`  Delivery shifted with trust: ${result.deliveryShiftWithTrust ? "yes" : "no"}`);
    lines.push(`  Stock phrase repeat rate: ${result.stockPhraseRepeatRate}`);
    lines.push(`  Lead reuse rate: ${result.leadReuseRate}`);
    lines.push("");
  });

  lines.push("Voice Provider Samples");
  lines.push("----------------------");
  report.voiceProviderSamples.forEach((sample) => {
    lines.push(`${sample.title} (${sample.id})`);
    if (sample.comparisonStatus === "skipped") {
      lines.push(`  Skipped: ${sample.skippedReason}`);
    } else if (sample.comparison) {
      sample.comparison.samples.forEach((entry) => {
        lines.push(`  ${entry.requestedProvider} -> ${entry.finalProvider}: latency=${entry.diagnostics.latencyMs}ms naturalness=${entry.diagnostics.quality.naturalness} repetitionRisk=${entry.diagnostics.quality.phraseRepetitionRisk} emotionalRealism=${entry.diagnostics.quality.emotionalRealism} interruptionRecovery=${entry.diagnostics.quality.interruptionRecovery} fallback=${entry.didFallback ? "yes" : "no"}`);
      });
    }
    lines.push("");
  });

  lines.push("Voice Rotation");
  lines.push("--------------");
  report.voiceRotationCases.forEach((result) => {
    lines.push(`${result.title} (${result.id})`);
    lines.push(`  Same-bot feel score: ${result.sameBotFeelScore}/100`);
    lines.push(`  Unique voices: ${result.uniqueVoiceCount}`);
    lines.push(`  Unique cadences: ${result.uniqueCadenceCount}`);
    lines.push(`  Unique personas: ${result.uniquePersonaCount}`);
    lines.push(`  Voice reuse rate: ${result.voiceReuseRate}`);
    lines.push(`  Cadence reuse rate: ${result.cadenceReuseRate}`);
    lines.push(`  Repeat caller consistent: ${result.repeatCallerConsistency ? "yes" : "no"}`);
    lines.push("");
  });

  if (report.providerMetrics.length > 0) {
    lines.push("Provider Metrics");
    lines.push("----------------");
    report.providerMetrics.forEach((metric) => {
      lines.push(`${metric.provider}: samples=${metric.samples} latency=${metric.avgLatencyMs}ms naturalness=${metric.avgNaturalness} repetitionRisk=${metric.avgPhraseRepetitionRisk} emotionalRealism=${metric.avgEmotionalRealism} interruptionRecovery=${metric.avgInterruptionRecovery} fallbackRate=${metric.fallbackRate}`);
    });
  }

  if (report.flags.length > 0) {
    lines.push("");
    lines.push("Flags");
    lines.push("-----");
    report.flags.forEach((flag) => {
      lines.push(`- ${flag}`);
    });
  }

  return lines.join("\n");
}
