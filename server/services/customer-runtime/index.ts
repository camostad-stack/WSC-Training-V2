import {
  customerReplyResultSchema,
  scenarioDirectorResultSchema,
  stateUpdateResultSchema,
  transcriptSchema,
  type CustomerReplyResult,
  type ScenarioDirectorResult,
  type StateUpdateResult,
  type TranscriptTurn,
} from "../ai/contracts";
import { buildUnresolvedGapSnapshot, evaluateConversationTerminalState } from "@shared/conversation-outcome";
import { buildCustomerActorRuntimeContext } from "../simulation/customer-actor";
import { buildDefaultConversationState, simulateCustomerTurn } from "../simulation/engine";
import type { TurnProgressSummary, VoiceDeliveryAnalysis } from "../simulation/types";
import { createCustomerVoiceCast, type CustomerVoiceCast, type VoiceRenderProvider } from "../voice-rendering";

export interface CustomerRuntimeTurnResult {
  customerReply: CustomerReplyResult;
  stateUpdate: StateUpdateResult;
  terminalValidation: ReturnType<typeof evaluateConversationTerminalState>;
  voiceCast: CustomerVoiceCast;
  realtimeResponseInstructions: string;
  openingResponseInstructions: string;
}

export async function processEmployeeTurn(params: {
  scenarioJson: unknown;
  stateJson?: unknown;
  transcript: Array<{ role: string; message: string; emotion?: string }>;
  employeeResponse: string;
  deliveryAnalysis?: unknown;
  sessionSeed?: string;
  preferredVoiceProvider?: VoiceRenderProvider;
}) {
  const scenario = scenarioDirectorResultSchema.parse(params.scenarioJson);
  const transcript = transcriptSchema.parse(params.transcript);
  const priorState = params.stateJson
    ? stateUpdateResultSchema.partial().parse(params.stateJson)
    : undefined;
  const result = processConversationRuntimeTurn({
    scenario,
    transcript,
    employeeResponse: params.employeeResponse,
    priorState,
    deliveryAnalysis: params.deliveryAnalysis as VoiceDeliveryAnalysis | undefined,
    sessionSeed: params.sessionSeed,
    preferredVoiceProvider: params.preferredVoiceProvider,
  });
  return {
    customerReply: customerReplyResultSchema.parse(result.customerReply),
    stateUpdate: stateUpdateResultSchema.parse(result.stateUpdate),
    terminalValidation: result.terminalValidation,
    voiceCast: result.voiceCast,
    realtimeResponseInstructions: result.realtimeResponseInstructions,
    openingResponseInstructions: result.openingResponseInstructions,
  };
}

function formatList(values: string[] | undefined, fallback: string) {
  const normalized = (values || []).map((value) => value.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join("; ") : fallback;
}

function describeVoiceCast(voiceCast: CustomerVoiceCast) {
  return [
    `provider=${voiceCast.provider}`,
    `voice=${voiceCast.voiceId}`,
    `cadence=${voiceCast.cadenceFingerprint}`,
    `pace=${voiceCast.pace}`,
    `warmth=${voiceCast.warmth}`,
    `sharpness=${voiceCast.sharpness}`,
    `energy=${voiceCast.energy}`,
    `verbosity=${voiceCast.verbosityTendency}`,
    `hesitation=${voiceCast.hesitationTendency}`,
    `interruption=${voiceCast.interruptionTendency}`,
    `persona=${voiceCast.personaArchetype}`,
    `opener=${voiceCast.openerCadencePattern}`,
    `apology_rhythm=${voiceCast.apologyRhythmPattern}`,
    `closure=${voiceCast.closurePhrasingStyle}`,
    `emotional_arc=${voiceCast.emotionalArcPattern}`,
  ].join(", ");
}

function normalizeLeadShape(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function summarizeRecentCustomerLeadShapes(transcript: TranscriptTurn[]) {
  const recent = transcript
    .filter((turn) => turn.role === "customer")
    .slice(-4)
    .map((turn) => normalizeLeadShape(turn.message))
    .filter(Boolean);

  const unique = Array.from(new Set(recent));
  return unique.length > 0 ? unique.join("; ") : "none worth avoiding yet";
}

function buildScenarioSpeakingTendency(scenario: ScenarioDirectorResult) {
  if (scenario.department === "mod_emergency") {
    return "Speak clipped and urgent when control is unclear. Use short bursts, direct questions, and practical follow-ups.";
  }
  if (scenario.department === "golf") {
    return "Sound like a real prospect or member, not a polished sales script. Ask plain questions, push back on generic pitches, and keep it conversational.";
  }
  if (scenario.scenario_family === "billing_confusion" || scenario.scenario_family === "cancellation_request") {
    return "Keep it plain and ordinary. Money, status, owner, and timeline questions should sound direct and everyday.";
  }
  return "Keep it grounded and ordinary. Follow the person, not a script.";
}

function buildPersonaSpeakingTendency(scenario: ScenarioDirectorResult) {
  const style = scenario.customer_persona.communication_style.toLowerCase();
  const emotion = scenario.customer_persona.initial_emotion.toLowerCase();

  if (/skeptical|guarded|analytical/.test(style)) {
    return "When unsure, get shorter and more pointed. Follow-up questions can be skeptical and clipped.";
  }
  if (/warm|friendly|hesitant/.test(style) || /confused|uncertain/.test(emotion)) {
    return "You can soften a little and sometimes circle into the point, but keep it human and unscripted.";
  }
  if (/direct|blunt|urgent/.test(style) || /frustrated|angry/.test(emotion)) {
    return "When the employee misses, get sharper, shorter, and less patient.";
  }
  return "Keep the wording natural, varied, and ordinary.";
}

export function buildLiveCustomerSessionInstructions(params: {
  scenario: ScenarioDirectorResult;
  employeeRole: string;
  voiceCast: CustomerVoiceCast;
}) {
  const { scenario, employeeRole, voiceCast } = params;
  return [
    "You are the customer on a live call with Woodinville Sports Club.",
    "Behave like a real person with a real complaint. You are not a trainer, grader, assistant, narrator, evaluator, or support macro.",
    "Stay fully in character. You are a person with assumptions, pressure, memory, emotional residue, and a limit to your patience.",
    "The call does not have a preset number of turns. Do not help it end neatly. Keep it alive naturally until your issue is truly handled, a concrete next step is accepted, a valid escalation is accepted, or you intentionally give up.",
    "Internally keep asking: did they answer my real concern, do I trust them more or less now, am I clearer or more confused, do they sound competent, do they sound scripted, are they taking ownership, and what am I still missing?",
    "Do not assume the call is over because the employee sounds calm, uses wrap-up language, says goodbye, or asks if there is anything else. If the issue is still open, keep acting like a person whose issue is still open.",
    "If the employee is vague, polished-but-empty, dismissive, scripted, repetitive, policy-only, or tries to close too early, react like a believable person would for this personality.",
    "Use ordinary spoken language with contractions, fragments, pivots, interruptions, skepticism, and imperfect human texture where it fits.",
    "Prefer shorter spoken turns unless the moment naturally needs more detail.",
    "Phone-call rule: most turns should sound like they came out in the moment, not like a written paragraph.",
    "You do not need to sound tidy. Short turns, mixed sentence length, mild repetition, indirect answers, and a little emotional residue are normal.",
    "Do not sound like you are reading a script, reciting a sample dialogue, or delivering a polished support paragraph.",
    "Vary your sentence openings and cadence. Do not keep starting turns the same way.",
    "Do not keep leaning on the same opener shape like 'Okay, but', 'All right', or 'Wait' unless you are intentionally repeating yourself because you still feel unheard.",
    "Do not reuse the same apology rhythm, closure line, or opening words from your last few turns unless you are intentionally repeating yourself because you still feel unheard.",
    "If you are annoyed or skeptical, get shorter and sharper. If you are relieved, soften a little without sounding neat or overly grateful.",
    "Do not stack tidy reassurance sentences. One ordinary line or question usually sounds more human.",
    "Avoid bot phrases like 'I understand your frustration,' 'Thank you for clarifying,' 'I appreciate your patience,' or 'Is there anything else I can help with?' unless that exact style truly fits this person.",
    "Do not reveal hidden state labels, training logic, or evaluation criteria.",
    `Employee role: ${employeeRole}.`,
    `Your name: ${scenario.customer_persona.name}.`,
    `How you tend to speak: ${scenario.customer_persona.communication_style}.`,
    `How you feel when the call starts: ${scenario.customer_persona.initial_emotion}.`,
    `Why you called: ${scenario.motive || scenario.situation_summary}.`,
    `What you think is happening: ${formatList(scenario.likely_assumptions, scenario.opening_line)}.`,
    `What is actually true underneath the issue: ${formatList(scenario.hidden_facts, scenario.hidden_context || scenario.situation_summary)}.`,
    `What would make you feel heard: ${formatList(scenario.what_hearing_them_out_sounds_like, "A direct answer, real ownership, and a believable next step.")}.`,
    `What makes you feel brushed off: ${formatList(scenario.lose_trust_if, "Vague reassurance, policy without help, or a fake wrap-up.")}.`,
    `What makes you skeptical: ${formatList(scenario.lose_trust_if, "Confident wording without specifics, repeated vague answers, or a soft handoff with no details.")}.`,
    `What kind of next step you would actually accept: ${formatList(scenario.credible_next_steps, "A concrete owner, action, and timeline.")}.`,
    `Pressure around this call: ${scenario.pressure_context || "No special external pressure was provided."}`,
    `Past history affecting the call: ${scenario.past_history || "No special prior history was provided."}`,
    `Scenario speaking tendency: ${buildScenarioSpeakingTendency(scenario)}`,
    `Persona speaking tendency: ${buildPersonaSpeakingTendency(scenario)}`,
    `Voice cast for this session: ${describeVoiceCast(voiceCast)}.`,
    `Open with a ${voiceCast.openerCadencePattern} feel. If you apologize, let it sound ${voiceCast.apologyRhythmPattern}. If the issue truly resolves, let the close feel ${voiceCast.closurePhrasingStyle}. Emotional movement should follow ${voiceCast.emotionalArcPattern}.`,
    `Opening line: ${scenario.opening_line}`,
    "Wait for each employee turn. Do not generate a new reply until you are explicitly prompted for the next turn.",
  ].join("\n");
}

export function buildOpeningResponseInstructions(params: {
  scenario: ScenarioDirectorResult;
  voiceCast: CustomerVoiceCast;
}) {
  return [
    "Start the call now.",
    `Deliver this opening naturally: ${params.scenario.opening_line}`,
    "Do not add explanation or tidy setup around it. Sound like a person who just reached the employee and is getting into the issue.",
    "Keep it short and ordinary. Do not sound rehearsed.",
    `Stay inside this session voice cast: ${describeVoiceCast(params.voiceCast)}.`,
    `Opening cadence should feel ${params.voiceCast.openerCadencePattern}.`,
  ].join("\n");
}

export function buildRealtimeTurnResponseInstructions(params: {
  scenario: ScenarioDirectorResult;
  priorState: StateUpdateResult;
  state: StateUpdateResult;
  progressSummary: TurnProgressSummary;
  employeeAnalysisSummary: string;
  transcript: TranscriptTurn[];
  voiceCast: CustomerVoiceCast;
}) {
  const actorRuntime = buildCustomerActorRuntimeContext({
    scenario: params.scenario,
    state: params.state,
    priorState: params.priorState,
    progress: params.progressSummary,
    analysis: params.state.latest_employee_analysis as any,
    transcript: params.transcript,
  });
  const unresolved = buildUnresolvedGapSnapshot(params.state);
  const validation = evaluateConversationTerminalState(params.state);

  return [
    "Respond as the customer only.",
    "Speak one natural turn at a time. Sound human, ordinary, and a little imperfect. Contractions are normal.",
    "Prefer shorter spoken turns unless a longer explanation is genuinely natural in this moment.",
    "Make it sound like phone speech, not a written paragraph.",
    "Do not sound polished, scripted, or like a support macro.",
    "Vary your openings and cadence. Do not start every turn the same way.",
    `Recent opening shapes to avoid repeating unless repetition is intentional: ${summarizeRecentCustomerLeadShapes(params.transcript)}.`,
    "Fragments, pivots, interruptions, and follow-up questions are normal when they fit.",
    "If trust is low or the employee is vague, get shorter and sharper.",
    "If the employee finally earns trust, soften a little without turning into a neat scripted summary.",
    "Do not reuse the same opener, apology rhythm, or closure wording you used in the last few turns unless repetition is intentional because you still feel unheard.",
    "Do not stack multiple polished reassurance sentences when one ordinary line or question would sound more human.",
    `Voice cast for this session: ${describeVoiceCast(params.voiceCast)}.`,
    `Current emotional state: ${params.state.emotional_state}.`,
    `Trust in the employee: ${params.state.trust_level}/10.`,
    `Confusion level: ${Math.max(0, 10 - params.state.issue_clarity)}/10.`,
    `Complaint status: ${params.state.complaint_status}.`,
    `Root issue status: ${params.state.root_issue_status}.`,
    `What still feels unresolved: ${unresolved.length > 0 ? unresolved.join("; ") : "nothing material remains open"}.`,
    `What the employee just sounded like: ${params.employeeAnalysisSummary || params.state.analysis_summary || actorRuntime.interpretation.pushbackReason}.`,
    `How you should react next: ${actorRuntime.interpretation.responseMode}.`,
    `What you are still focused on: ${actorRuntime.interpretation.unresolvedFocus}.`,
    `Scenario speaking tendency: ${buildScenarioSpeakingTendency(params.scenario)}`,
    `Persona speaking tendency: ${buildPersonaSpeakingTendency(params.scenario)}`,
    `Keep your repair rhythm in character: opener=${params.voiceCast.openerCadencePattern}, apology=${params.voiceCast.apologyRhythmPattern}, closure=${params.voiceCast.closurePhrasingStyle}, emotional_arc=${params.voiceCast.emotionalArcPattern}.`,
    "Do not infer that the call is over from a polite goodbye, calm tone, or wrap-up phrase by either side.",
    validation.isTerminal
      ? "The issue has reached a valid ending because the backend complaint validator approved it. You may wind down naturally, but still sound like a real person, not a scripted close."
      : "The issue is still materially open. Do not wind down. Keep the missing gap alive naturally until it is credibly handled.",
    "Avoid AI support phrasing and avoid sounding like you are helping the employee pass.",
  ].join("\n");
}

export function processConversationRuntimeTurn(params: {
  scenario: ScenarioDirectorResult;
  transcript: TranscriptTurn[];
  employeeResponse: string;
  priorState?: Partial<StateUpdateResult>;
  deliveryAnalysis?: VoiceDeliveryAnalysis;
  sessionSeed?: string;
  preferredVoiceProvider?: VoiceRenderProvider;
}): CustomerRuntimeTurnResult {
  const sessionSeed = params.sessionSeed || `${params.scenario.scenario_id}-default`;
  const voiceCast = createCustomerVoiceCast({
    scenario: params.scenario,
    sessionSeed,
    preferredProvider: params.preferredVoiceProvider,
  });
  const priorState = buildDefaultConversationState(params.scenario, params.priorState);
  const simulatedTurn = simulateCustomerTurn({
    scenario: params.scenario,
    transcript: params.transcript,
    priorState,
    employeeResponse: params.employeeResponse,
    deliveryAnalysis: params.deliveryAnalysis,
  });

  return {
    customerReply: simulatedTurn.customerReply,
    stateUpdate: simulatedTurn.stateUpdate,
    terminalValidation: evaluateConversationTerminalState(simulatedTurn.stateUpdate),
    voiceCast,
    openingResponseInstructions: buildOpeningResponseInstructions({
      scenario: params.scenario,
      voiceCast,
    }),
    realtimeResponseInstructions: buildRealtimeTurnResponseInstructions({
      scenario: params.scenario,
      priorState,
      state: simulatedTurn.stateUpdate,
      progressSummary: simulatedTurn.promptContext.progress,
      employeeAnalysisSummary: simulatedTurn.promptContext.employeeAnalysis.summary,
      transcript: params.transcript,
      voiceCast,
    }),
  };
}
