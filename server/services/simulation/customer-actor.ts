import type { ScenarioDirectorResult, TranscriptTurn } from "../ai/contracts";
import { evaluateConversationTerminalState } from "@shared/conversation-outcome";
import { buildGoalPrompt } from "./goals";
import { buildNegativeCustomerReaction } from "./emotion";
import { buildCustomerHumanProfile } from "./actor-profile";
import { interpretActorTurn } from "./actor-reaction";
import type {
  ActorResponseMode,
  CustomerHumanProfile,
  EmployeeUtteranceAnalysis,
  ServiceFailureLevel,
  SimulationStateDraft,
  TurnProgressSummary,
} from "./types";

function isUrgentScenario(scenario: ScenarioDirectorResult) {
  return scenario.department === "mod_emergency"
    || ["slippery_entry_complaint", "unsafe_equipment_report", "weather_range_incident", "emergency_response"].includes(scenario.scenario_family);
}

function hashText(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

const STOCK_SUPPORT_PATTERNS = [
  /\bi understand your frustration\b/i,
  /\bthank you for clarifying\b/i,
  /\bi appreciate your patience\b/i,
  /\bi appreciate that\b/i,
  /\blet me know how you(?: would|'d) like to proceed\b/i,
  /\bis there anything else i can help with\b/i,
  /\blet me assist you with that\b/i,
  /\bthat sounds great\b/i,
  /\bi(?: would|'d) be happy to help\b/i,
];

function normalizeMessage(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function leadingKey(message: string, count = 3) {
  return normalizeMessage(message)
    .split(" ")
    .filter(Boolean)
    .slice(0, count)
    .join(" ");
}

function hasStockSupportLanguage(message: string) {
  return STOCK_SUPPORT_PATTERNS.some((pattern) => pattern.test(message));
}

function sentenceStarts(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => leadingKey(sentence, 2))
    .filter(Boolean);
}

function chooseVariant(options: string[], seed: string, recentCustomerMessages: string[]) {
  const normalizedRecent = recentCustomerMessages.map((message) => normalizeMessage(message)).filter(Boolean);
  const recentLeads = new Set(recentCustomerMessages.map((message) => leadingKey(message)).filter(Boolean));
  const recentSentenceStarts = new Set(recentCustomerMessages.flatMap((message) => sentenceStarts(message)));
  const freshOptions = options.filter((option) => {
    const normalizedOption = normalizeMessage(option);
    return !normalizedRecent.includes(normalizedOption)
      && !recentLeads.has(leadingKey(option))
      && !sentenceStarts(option).some((start) => recentSentenceStarts.has(start))
      && !hasStockSupportLanguage(option);
  });
  const lessRepeatedOptions = options.filter((option) => {
    const normalizedOption = normalizeMessage(option);
    return !normalizedRecent.includes(normalizedOption) && !hasStockSupportLanguage(option);
  });
  const usableOptions = freshOptions.length > 0
    ? freshOptions
    : lessRepeatedOptions.length > 0
      ? lessRepeatedOptions
      : options.filter((option) => !hasStockSupportLanguage(option));
  const finalOptions = usableOptions.length > 0 ? usableOptions : options;
  return finalOptions[hashText(seed) % finalOptions.length];
}

function recentCustomerMessages(transcript: TranscriptTurn[]) {
  return transcript
    .filter((turn) => turn.role === "customer")
    .slice(-6)
    .map((turn) => turn.message);
}

function recentEmployeeMessages(transcript: TranscriptTurn[]) {
  return transcript
    .filter((turn) => turn.role === "employee")
    .slice(-4)
    .map((turn) => turn.message);
}

function normalizeFocusQuestion(params: {
  focus: string;
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  progress: TurnProgressSummary;
  recent: string[];
}) {
  const rawFocus = params.focus.trim();
  if (/^(what|who|when|why|how|can|do|does|did|is|are)\b/i.test(rawFocus) && rawFocus.endsWith("?")) {
    return rawFocus;
  }

  const focus = rawFocus.toLowerCase();
  const goalPrompt = buildGoalPrompt(params.progress, params.state.turn_number).trim();

  if (isUrgentScenario(params.scenario)) {
    if (/direction|people|safe|clear|step|do right now|instruction/.test(focus)) {
      return chooseVariant([
        "What do you need people to do right now?",
        "What do you need from anyone nearby right now?",
        "Okay, what does everyone need to do right now?",
      ], `${params.state.turn_number}-focus-urgent-direction`, params.recent);
    }
    if (/update|timeline|next/.test(focus)) {
      return chooseVariant([
        "Okay, and what is the next update?",
        "What happens from here until care arrives?",
        "All right, what should I expect next from you?",
      ], `${params.state.turn_number}-focus-urgent-update`, params.recent);
    }
  }

  if (/timeline|when|update|follow up|hear back/.test(focus)) {
    return chooseVariant([
      "When am I actually hearing back?",
      "So when does that happen?",
      "Okay, and when am I getting the next update?",
    ], `${params.state.turn_number}-focus-timeline`, params.recent);
  }

  if (/owner|who|follow up|taking this over|redirect|manager|handoff/.test(focus)) {
    return chooseVariant([
      "Who exactly owns this from here?",
      "So who is actually handling this?",
      "Okay, but who is taking this over?",
    ], `${params.state.turn_number}-focus-owner`, params.recent);
  }

  if (/policy|explained|why|clarify|what happened|pending|final|benefit/.test(focus)) {
    return chooseVariant([
      "Okay, then explain what that actually means for me.",
      "Can you just tell me plainly what happened here?",
      "That still needs a clearer explanation.",
    ], `${params.state.turn_number}-focus-explain`, params.recent);
  }

  if ((/discovery/.test(focus) || /fit|hesitation|looking for|recommend/.test(focus)) && params.scenario.department === "golf") {
    return chooseVariant([
      "Then ask me what I actually want out of this first.",
      "Can you find out what I am looking for before pitching me?",
      "You still have not asked what I actually want.",
    ], `${params.state.turn_number}-focus-golf`, params.recent);
  }

  if (
    params.scenario.department === "golf"
    && (params.state.clarification_depth >= 1 || params.state.issue_clarity >= 4)
  ) {
    return chooseVariant([
      "Okay, so what would you actually recommend for me?",
      "Then what would you actually recommend based on that?",
      "All right, so what do you actually think fits me?",
    ], `${params.state.turn_number}-focus-golf-recommend`, params.recent);
  }

  return chooseVariant([
    goalPrompt,
    `Okay, but ${goalPrompt.charAt(0).toLowerCase()}${goalPrompt.slice(1)}`,
    "What is the actual next step here?",
  ], `${params.state.turn_number}-focus-generic`, params.recent);
}

function humanizeMissingGap(gap?: string) {
  if (!gap) return "";
  const lower = gap.toLowerCase();
  if (lower.includes("next step owner") || lower.includes("owner")) {
    return "I still do not know who actually owns this.";
  }
  if (lower.includes("next step timeline") || lower.includes("timeline") || lower.includes("when")) {
    return "I still do not know when this is actually happening.";
  }
  if (lower.includes("next step action") || lower.includes("action")) {
    return "I still do not know what anyone is actually doing next.";
  }
  if (lower.includes("acknowledged next step")) {
    return "I still do not have a real next step to work with.";
  }
  return gap;
}

function buildIssueAnchor(params: {
  scenario: ScenarioDirectorResult;
  profile: CustomerHumanProfile;
  state: SimulationStateDraft;
  recent: string[];
}) {
  const seed = `issue-anchor-${params.state.turn_number}-${params.state.trust_level}`;
  const firstGap = humanizeMissingGap(params.state.unresolved_subissues[0] || params.state.unresolved_customer_questions[0]);
  const repeatOften = params.profile.repetitionStyle === "high" || params.state.no_progress_turns >= 2;

  if (params.scenario.scenario_family === "billing_confusion") {
    return chooseVariant([
      repeatOften ? "I still have the same billing problem sitting here." : "I am still looking at the same charge issue.",
      "I still do not know what is happening with those charges.",
      "This is still the same charge problem for me.",
    ], seed, params.recent);
  }

  if (params.scenario.scenario_family === "cancellation_request") {
    return chooseVariant([
      "I still do not know whether this cancellation is actually in place.",
      "I still do not know if this account is really canceled.",
      "I still do not know what status this cancellation is in.",
    ], seed, params.recent);
  }

  if (params.scenario.department === "golf") {
    return chooseVariant([
      "You are still pitching me before finding out what I am actually looking for.",
      "This still feels like a pitch, not a real fit conversation.",
      "You still have not asked what I am actually looking for.",
    ], seed, params.recent);
  }

  if (isUrgentScenario(params.scenario)) {
    return chooseVariant([
      "This still feels live right now.",
      "This is still active right now.",
      "This still needs a real answer right now.",
    ], seed, params.recent);
  }

  if (firstGap) {
    return chooseVariant([
      firstGap,
      `No, because ${firstGap.charAt(0).toLowerCase()}${firstGap.slice(1)}`,
      `I am still stuck on this: ${firstGap.charAt(0).toLowerCase()}${firstGap.slice(1)}`,
    ], seed, params.recent);
  }

  return chooseVariant([
    "This still is not settled for me.",
    "I still do not have what I need here.",
    "I am still missing the part that matters.",
  ], seed, params.recent);
}

function buildLeadFragment(params: {
  profile: CustomerHumanProfile;
  mode: ActorResponseMode;
  state: SimulationStateDraft;
  recent: string[];
  shouldInterrupt: boolean;
  shouldUseSarcasm: boolean;
}) {
  const seed = `${params.mode}-${params.state.turn_number}-${params.state.trust_level}-${params.state.offense_level}`;

  if (params.shouldUseSarcasm) {
    return chooseVariant(["Great.", "Right.", "Sure."], seed, params.recent);
  }

  if (params.shouldInterrupt) {
    if (params.profile.interruptionStyle === "frequent") {
      return chooseVariant(params.profile.usesFragments ? ["Wait.", "No, hold on.", "Hang on."] : ["Wait a second.", "No, hold on here.", "Hang on a second."], seed, params.recent);
    }
    return chooseVariant(["Okay, wait.", "Hold on.", "All right, wait."], seed, params.recent);
  }

  if (params.mode === "tentative_soften" || params.mode === "close_out") {
    return chooseVariant(["Okay.", "All right.", ""], seed, params.recent);
  }

  if (params.profile.warmthStyle === "warm") {
    return chooseVariant(["Okay,", "All right,", ""], seed, params.recent);
  }

  if (params.profile.speakingPattern === "skeptical") {
    return chooseVariant(["Okay, but", "Right, but", "I mean,"], seed, params.recent);
  }

  return chooseVariant(["Okay,", "", "Look,"], seed, params.recent);
}

function buildCoreLine(params: {
  mode: ActorResponseMode;
  profile: CustomerHumanProfile;
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  focusQuestion: string;
  failureLevel: ServiceFailureLevel;
  stillMissing: string[];
  shouldAnswerIndirectly: boolean;
  recent: string[];
}) {
  const seed = `${params.mode}-${params.state.turn_number}-${params.state.trust_level}-${params.state.issue_clarity}-${params.failureLevel}`;
  const softenedFocus = params.focusQuestion.charAt(0).toLowerCase() + params.focusQuestion.slice(1);

  switch (params.mode) {
    case "reopen_unresolved":
      return chooseVariant([
        `That still does not close this out. ${params.focusQuestion}`,
        `We are not done yet. ${params.focusQuestion}`,
        `${params.focusQuestion}`,
      ], seed, params.recent);
    case "request_manager":
      return chooseVariant([
        "I want a manager on this now.",
        `I need a manager, because ${softenedFocus}`,
        "Get me the manager on duty. This is not settled.",
      ], seed, params.recent);
    case "call_out_tone":
      return chooseVariant([
        `Do not talk to me like that. ${params.focusQuestion}`,
        `That tone is not helping. ${params.focusQuestion}`,
        `You are talking past me. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "call_out_repetition":
      return chooseVariant([
        `You are saying the same thing again. ${params.focusQuestion}`,
        `That is basically the same answer again. ${params.focusQuestion}`,
        `You keep circling the same point. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "question_competence":
      return chooseVariant([
        `That does not sound right. ${params.focusQuestion}`,
        `You sound sure, but that is not actually clear. ${params.focusQuestion}`,
        `No, that is not giving me confidence. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "skeptical_challenge":
      return chooseVariant([
        `That still sounds slippery to me. ${params.focusQuestion}`,
        `You are still talking around it. ${params.focusQuestion}`,
        `Maybe, but that still is not concrete. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "press_for_ownership":
      return chooseVariant([
        "Okay, but who is actually doing what from here?",
        "Fine, but who owns the next step and what are they doing?",
        `you still have not told me who is taking this and what happens next. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "confused_reopen":
      return chooseVariant([
        params.shouldAnswerIndirectly ? "So what am I supposed to do with that?" : `I am still not following. ${params.focusQuestion}`,
        params.shouldAnswerIndirectly ? "So... am I just supposed to wait here?" : `That still is not clear to me. ${params.focusQuestion}`,
        `Wait, what does that actually mean for me?`,
      ], seed, params.recent);
    case "tentative_soften":
      return chooseVariant([
        `That is better. ${params.focusQuestion}`,
        `That is at least more specific. ${params.focusQuestion}`,
        `Fine. That is clearer. ${params.focusQuestion}`,
      ], seed, params.recent);
    case "follow_direction":
      return chooseVariant([
        "Okay. Tell me exactly what you need me to do.",
        "All right. What do you need from me right now?",
        "Okay. What is the immediate instruction?",
      ], seed, params.recent);
    case "close_out":
      if (evaluateConversationTerminalState(params.state).outcome === "ESCALATED") {
        return chooseVariant([
          "Okay. If they are taking it from here and I know when that happens, fine.",
          "All right. As long as that handoff is actually happening now.",
          "Okay. If that manager is taking this over now, then fine.",
        ], seed, params.recent);
      }
      if (isUrgentScenario(params.scenario)) {
        return chooseVariant([
          "Okay. Keep me updated until care arrives or this is fully handed off.",
          "All right. Stay on it and keep me updated until care arrives.",
          "Okay. As long as someone owns it from here and I keep getting updates.",
        ], seed, params.recent);
      }
      return chooseVariant([
        "That answers it, and I know what happens next.",
        "That is specific enough for me to work with.",
        "That is clearer. I know the next step now.",
      ], seed, params.recent);
    case "disengage":
      return chooseVariant([
        "Right. This is not going anywhere.",
        "Okay. I am not getting anywhere with this.",
        "No. This is just going in circles now.",
      ], seed, params.recent);
    case "seek_specific_answer":
    default:
      if (
        params.scenario.department === "golf"
        && (params.state.clarification_depth >= 1 || params.state.issue_clarity >= 4)
      ) {
        return chooseVariant([
          "Okay, so what would you actually recommend for me?",
          "Then what would you actually recommend based on that?",
          "All right, so what do you actually think fits me?",
        ], `${seed}-golf-recommend`, params.recent);
      }
      return chooseVariant([
        params.shouldAnswerIndirectly ? "So what is the actual plan here?" : params.focusQuestion,
        `Okay, but ${softenedFocus}`,
        `I still need a real answer here. ${params.focusQuestion}`,
        params.stillMissing[0]
          ? `${humanizeMissingGap(params.stillMissing[0])} ${params.focusQuestion}`
          : params.focusQuestion,
      ], seed, params.recent);
  }
}

function cleanReply(text: string) {
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+([?.!,])/g, "$1")
    .trim();
  if (!cleaned) return cleaned;
  return /^[a-z]/.test(cleaned) ? `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}` : cleaned;
}

function applySpokenContractions(text: string) {
  return text
    .replace(/\bI am\b/g, "I'm")
    .replace(/\bI will\b/g, "I'll")
    .replace(/\bI have\b/g, "I've")
    .replace(/\bI do not\b/g, "I don't")
    .replace(/\bI did not\b/g, "I didn't")
    .replace(/\bI cannot\b/g, "I can't")
    .replace(/\bI can not\b/g, "I can't")
    .replace(/\bWe are\b/g, "We're")
    .replace(/\bYou are\b/g, "You're")
    .replace(/\bThat is\b/g, "That's")
    .replace(/\bIt is\b/g, "It's")
    .replace(/\bThere is\b/g, "There's")
    .replace(/\bDo not\b/g, "Don't")
    .replace(/\bDoes not\b/g, "Doesn't")
    .replace(/\bDid not\b/g, "Didn't")
    .replace(/\bIs not\b/g, "Isn't")
    .replace(/\bAre not\b/g, "Aren't")
    .replace(/\bCan not\b/g, "Can't")
    .replace(/\bCannot\b/g, "Can't")
    .replace(/\bWill not\b/g, "Won't");
}

function deScriptifyReply(text: string) {
  return text
    .replace(/\bI understand your frustration\b/gi, "Okay")
    .replace(/\bThank you for clarifying\b/gi, "Okay")
    .replace(/\bI appreciate your patience\b/gi, "")
    .replace(/\bI appreciate that\b/gi, "Okay")
    .replace(/\bLet me know how you'd like to proceed\b/gi, "So what happens next?")
    .replace(/\bLet me know how you would like to proceed\b/gi, "So what happens next?")
    .replace(/\bIs there anything else I can help with\b/gi, "")
    .replace(/\bLet me assist you with that\b/gi, "Let me ask this plainly")
    .replace(/\bThat sounds great\b/gi, "Okay")
    .replace(/\bI'd be happy to help\b/gi, "Okay")
    .replace(/\bI would be happy to help\b/gi, "Okay");
}

function trimForPhoneCadence(params: {
  text: string;
  profile: CustomerHumanProfile;
  state: SimulationStateDraft;
  interpretation: ReturnType<typeof interpretActorTurn>;
}) {
  if (params.interpretation.responseMode === "call_out_tone" || params.interpretation.responseMode === "request_manager") {
    return params.text;
  }

  const words = params.text.split(/\s+/).filter(Boolean);
  const shouldTighten = (
    params.interpretation.shouldChallenge
    || params.interpretation.shouldReopen
    || params.state.trust_level <= 3
    || params.state.offense_level >= 6
    || params.profile.speakingPattern === "urgent"
    || params.profile.speakingPattern === "skeptical"
  );
  if (!shouldTighten || words.length <= 18) {
    return params.text;
  }

  const questionIndex = params.text.indexOf("?");
  if (questionIndex >= 0) {
    return params.text.slice(0, questionIndex + 1).trim();
  }

  const sentences = params.text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length <= 1) {
    return params.text;
  }

  const firstSentence = sentences[0] || "";
  const firstSentenceWordCount = firstSentence.split(/\s+/).filter(Boolean).length;
  if (firstSentenceWordCount <= 2) {
    return `${firstSentence} ${sentences[1]}`.trim();
  }

  return firstSentence;
}

function varyOpeningFromRecent(text: string, recent: string[]) {
  const recentLeadKeys = new Set(recent.map((message) => leadingKey(message)).filter(Boolean));
  if (!recentLeadKeys.has(leadingKey(text))) {
    return text;
  }

  return text
    .replace(/^(Okay,?\s+but\s+)/i, "")
    .replace(/^(Okay,?\s+)/i, "")
    .replace(/^(All right,?\s+)/i, "")
    .replace(/^(Right,?\s+)/i, "")
    .replace(/^(Look,?\s+)/i, "")
    .replace(/^(No,?\s+)/i, "");
}

function collapseOverlyNeatPhoneRhythm(text: string) {
  return text
    .replace(/\b(Okay|All right|Right),?\s+(Okay|All right|Right),?\s+/i, "$1 ")
    .replace(/\b(Okay|All right|Right)\.\s+(Okay|All right|Right)\.\s+/i, "$1. ")
    .replace(/\bjust keep it specific with me\.\s+i can work with specific\./i, "Just keep it specific with me.")
    .replace(/\bthat is at least more specific\.\s+just keep it specific with me\./i, "That's more specific. Just keep it specific with me.");
}

function alignCadenceToPersona(params: {
  text: string;
  profile: CustomerHumanProfile;
  interpretation: ReturnType<typeof interpretActorTurn>;
  state: SimulationStateDraft;
}) {
  let next = params.text;
  const shouldSharpen = (
    params.interpretation.shouldChallenge
    || params.interpretation.shouldReopen
    || params.state.trust_level <= 3
    || params.state.offense_level >= 6
  );

  if (shouldSharpen && params.profile.speakingPattern === "skeptical") {
    next = next
      .replace(/\bThat is\b/g, "That's")
      .replace(/\bThat does not\b/g, "That doesn't")
      .replace(/\bI am still\b/g, "I'm still");
  }

  if (shouldSharpen && params.profile.usesFragments && !next.includes("?")) {
    const sentences = next.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 1) {
      next = `${sentences[0]} ${sentences[sentences.length - 1]}`.trim();
    }
  }

  if (!shouldSharpen && params.interpretation.feltHeard && params.profile.warmthStyle === "warm") {
    next = next
      .replace(/\bFine\.\s+/g, "")
      .replace(/\bThat is better\b/g, "Okay, that's better")
      .replace(/\bThat is clearer\b/g, "Okay, that's clearer");
  }

  return next;
}

function enforceSpokenStyle(params: {
  text: string;
  profile: CustomerHumanProfile;
  state: SimulationStateDraft;
  interpretation: ReturnType<typeof interpretActorTurn>;
  recent: string[];
}) {
  let next = cleanReply(params.text);
  next = deScriptifyReply(next);
  next = applySpokenContractions(next);
  next = trimForPhoneCadence({
    text: next,
    profile: params.profile,
    state: params.state,
    interpretation: params.interpretation,
  });
  next = varyOpeningFromRecent(next, params.recent);
  next = collapseOverlyNeatPhoneRhythm(next);
  next = alignCadenceToPersona({
    text: next,
    profile: params.profile,
    interpretation: params.interpretation,
    state: params.state,
  });
  next = cleanReply(next);
  if (hasStockSupportLanguage(next)) {
    next = cleanReply(deScriptifyReply(next));
  }
  return next;
}

function enforceDirectPushbackStyle(text: string) {
  let next = cleanReply(text);
  next = deScriptifyReply(next);
  next = applySpokenContractions(next);
  next = cleanReply(next);
  if (hasStockSupportLanguage(next)) {
    next = cleanReply(deScriptifyReply(next));
  }
  return next;
}

function startsWithSameLead(prefix: string, core: string) {
  const normalizedPrefix = prefix.toLowerCase().replace(/[^\w]+/g, "");
  const normalizedCore = core.toLowerCase().replace(/[^\w]+/g, "");
  return Boolean(normalizedPrefix) && normalizedCore.startsWith(normalizedPrefix);
}

function composeHumanReply(params: {
  profile: CustomerHumanProfile;
  mode: ActorResponseMode;
  state: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  scenario: ScenarioDirectorResult;
  failureLevel: ServiceFailureLevel;
  interpretation: ReturnType<typeof interpretActorTurn>;
  unresolvedFocus: string;
  transcript: TranscriptTurn[];
  recent: string[];
}) {
  const focusQuestion = normalizeFocusQuestion({
    focus: params.unresolvedFocus,
    scenario: params.scenario,
    state: params.state,
    progress: params.progress,
    recent: params.recent,
  });
  const prefix = buildLeadFragment({
    profile: params.profile,
    mode: params.mode,
    state: params.state,
    recent: params.recent,
    shouldInterrupt: params.interpretation.shouldInterrupt,
    shouldUseSarcasm: params.interpretation.shouldUseSarcasm,
  }).trim();
  const issueAnchor = params.interpretation.shouldRepeatConcern
    && !["close_out", "follow_direction", "request_manager", "call_out_tone"].includes(params.mode)
    ? buildIssueAnchor({
      scenario: params.scenario,
      profile: params.profile,
      state: params.state,
      recent: params.recent,
    })
    : "";
  const employeeEcho = recentEmployeeMessages(params.transcript).slice(-1)[0] || "";
  const core = buildCoreLine({
    mode: params.mode,
    profile: params.profile,
    scenario: params.scenario,
    state: params.state,
    analysis: params.analysis,
    progress: params.progress,
    focusQuestion,
    failureLevel: params.failureLevel,
    stillMissing: params.interpretation.stillMissing,
    shouldAnswerIndirectly: params.interpretation.shouldAnswerIndirectly,
    recent: params.recent,
  });

  if (params.mode === "call_out_tone" || params.mode === "request_manager") {
    return enforceDirectPushbackStyle([prefix, core].filter(Boolean).join(" "));
  }

  const textureTail = (() => {
    const seed = `texture-${params.mode}-${params.state.turn_number}-${params.state.trust_level}`;
    if (params.mode === "close_out" || params.mode === "disengage" || params.mode === "follow_direction") {
      return "";
    }
    if (params.interpretation.employeeRepeatedThemselves && employeeEcho) {
      return chooseVariant([
        "You already basically said that.",
        "That is what you just told me.",
        "I feel like I have heard that part already.",
      ], seed, params.recent);
    }
    if (params.interpretation.feltBrushedOff) {
      return chooseVariant([
        "That feels like you are trying to move past it.",
        "That still feels like a brush-off.",
        "That is what is throwing me here.",
      ], seed, params.recent);
    }
    if (params.interpretation.feltHeard && params.mode === "tentative_soften") {
      return chooseVariant([
        "",
        "Just keep it specific with me.",
        "I can work with specific.",
      ], seed, params.recent);
    }
    return "";
  })();

  const pieces = [prefix, issueAnchor, core, textureTail].filter(Boolean);
  const reply = pieces
    .map((piece, index) => {
      if (index === 0) return piece;
      if (/^[a-z]/.test(piece)) return piece;
      return piece;
    })
    .join(" ");

  if (!prefix || startsWithSameLead(prefix, core)) {
    return enforceSpokenStyle({
      text: [issueAnchor, core, textureTail].filter(Boolean).join(" "),
      profile: params.profile,
      state: params.state,
      interpretation: params.interpretation,
      recent: params.recent,
    });
  }
  return enforceSpokenStyle({
    text: reply,
    profile: params.profile,
    state: params.state,
    interpretation: params.interpretation,
    recent: params.recent,
  });
}

export function buildCustomerActorRuntimeContext(params: {
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  priorState: SimulationStateDraft;
  progress: TurnProgressSummary;
  analysis: EmployeeUtteranceAnalysis;
  transcript: TranscriptTurn[];
}) {
  const profile = buildCustomerHumanProfile({
    scenario: params.scenario,
    state: params.state,
  });
  const negativeReaction = buildNegativeCustomerReaction({
    scenario: params.scenario,
    priorState: params.priorState,
    state: params.state,
    analysis: params.analysis,
    recentConversationHistory: params.transcript,
  });
  const interpretation = interpretActorTurn({
    profile,
    scenario: params.scenario,
    state: params.state,
    priorState: params.priorState,
    analysis: params.analysis,
    progress: params.progress,
    transcript: params.transcript,
    failureLevel: negativeReaction.failureLevel,
  });

  return {
    profile,
    interpretation,
    failureLevel: negativeReaction.failureLevel,
    failureReason: negativeReaction.reason,
  };
}

export function buildCustomerActorReply(params: {
  scenario: ScenarioDirectorResult;
  state: SimulationStateDraft;
  progress: TurnProgressSummary;
  analysis: EmployeeUtteranceAnalysis;
  priorState: SimulationStateDraft;
  transcript: TranscriptTurn[];
}) {
  const recent = recentCustomerMessages(params.transcript);
  const runtime = buildCustomerActorRuntimeContext(params);

  return composeHumanReply({
    profile: runtime.profile,
    mode: runtime.interpretation.responseMode,
    state: params.state,
    analysis: params.analysis,
    progress: params.progress,
    scenario: params.scenario,
    failureLevel: runtime.failureLevel,
    interpretation: runtime.interpretation,
    unresolvedFocus: runtime.interpretation.unresolvedFocus,
    transcript: params.transcript,
    recent,
  });
}
