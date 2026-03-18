import type { InsertScenarioTemplate } from "../../drizzle/schema";
import { departmentLabels, departmentRoles, familyLabels, scenarioFamiliesByDepartment } from "../../shared/wsc-content";
import { scenarioDirectorResultSchema, type ScenarioDirectorResult } from "./ai/contracts";
import { normalizeDepartment } from "./normalizers";
import { normalizePolicyScenarioFamilies } from "./policy-matching";

type DepartmentKey = keyof typeof scenarioFamiliesByDepartment;

export type ScenarioBriefHints = {
  department: DepartmentKey;
  scenarioFamily?: string;
  difficulty: number;
  employeeRole: string;
};

const FAMILY_KEYWORDS: Record<string, string[]> = {
  billing_confusion: ["billing", "charge", "charged", "double charge", "double billing", "invoice", "autopay", "pending charge"],
  cancellation_request: ["cancel", "cancellation", "terminate membership", "ending membership", "stop membership"],
  reservation_issue: ["reservation", "booked", "booking", "court", "class slot", "schedule conflict", "check in"],
  upset_parent: ["parent", "child", "kid", "pickup", "youth", "family concern", "guardian"],
  membership_question: ["membership", "join", "guest pass", "upgrade", "downgrade", "plan option"],
  member_complaint: ["rude", "complaint", "bad experience", "staff issue", "service issue", "front desk"],
  hesitant_prospect: ["prospect", "tour", "joining", "considering membership", "thinking about joining"],
  lesson_inquiry: ["lesson", "coach", "instruction", "clinic", "teaching pro"],
  range_complaint: ["range", "bay", "mat", "ball machine", "practice area"],
  refund_credit_request: ["refund", "credit", "money back", "charged back", "comp"],
  value_explanation: ["value", "worth it", "price", "cost", "why is it so expensive"],
  slippery_entry_complaint: ["slippery", "wet floor", "entry", "spill", "fall risk"],
  power_interruption_confusion: ["power", "outage", "lights out", "system down", "lost power"],
  unsafe_equipment_report: ["unsafe equipment", "broken machine", "equipment issue", "equipment broken", "hazard"],
  weather_range_incident: ["weather", "lightning", "storm", "range closure", "rain delay"],
  emergency_response: ["emergency", "injury", "collapsed", "unconscious", "medical", "911", "ems", "manager on duty", "care arrives"],
};

const DEPARTMENT_KEYWORDS: Record<DepartmentKey, string[]> = {
  customer_service: ["front desk", "member services", "membership", "billing", "reservation", "parent", "check in"],
  golf: ["golf", "range", "lesson", "tee", "pro shop", "prospect", "credit request"],
  mod_emergency: ["emergency", "safety", "hazard", "injury", "power outage", "wet floor", "equipment", "collapsed", "medical", "ems", "manager on duty"],
};

function normalizeText(value: string) {
  return value.toLowerCase();
}

function countKeywordHits(haystack: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function inferDepartmentFromText(text: string): DepartmentKey {
  const normalized = normalizeText(text);
  let bestDepartment: DepartmentKey = "customer_service";
  let bestScore = 0;

  for (const [department, keywords] of Object.entries(DEPARTMENT_KEYWORDS) as Array<[DepartmentKey, string[]]>) {
    const score = countKeywordHits(normalized, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestDepartment = department;
    }
  }

  return bestDepartment;
}

function inferBestFamilyAcrossDepartments(text: string) {
  const normalized = normalizeText(text);
  let bestDepartment: DepartmentKey | undefined;
  let bestFamily: string | undefined;
  let bestScore = 0;

  for (const [department, families] of Object.entries(scenarioFamiliesByDepartment) as Array<[DepartmentKey, string[]]>) {
    for (const family of families) {
      const label = familyLabels[family] ?? family.replace(/_/g, " ");
      const familyScore = countKeywordHits(normalized, [
        family.replace(/_/g, " "),
        label.toLowerCase(),
        ...(FAMILY_KEYWORDS[family] ?? []),
      ]);
      if (familyScore > bestScore) {
        bestScore = familyScore;
        bestDepartment = department;
        bestFamily = family;
      }
    }
  }

  if (!bestDepartment || !bestFamily || bestScore === 0) return null;
  return { department: bestDepartment, scenarioFamily: bestFamily };
}

function inferScenarioFamilyFromText(text: string, department: DepartmentKey) {
  const normalized = normalizeText(text);
  const families = scenarioFamiliesByDepartment[department];
  let bestFamily: string | undefined;
  let bestScore = 0;

  for (const family of families) {
    const label = familyLabels[family] ?? family.replace(/_/g, " ");
    const familyScore = countKeywordHits(normalized, [
      family.replace(/_/g, " "),
      label.toLowerCase(),
      ...(FAMILY_KEYWORDS[family] ?? []),
    ]);
    if (familyScore > bestScore) {
      bestScore = familyScore;
      bestFamily = family;
    }
  }

  return bestFamily;
}

function inferDifficultyFromText(text: string) {
  const normalized = normalizeText(text);
  if (/(emergency|collapsed|medical|unsafe|injury|threat|furious|escalated|manager now)/.test(normalized)) return 5;
  if (/(angry|upset|multiple issues|complex|unclear|policy dispute|refund|credit)/.test(normalized)) return 4;
  if (/(simple|quick|routine|basic)/.test(normalized)) return 2;
  return 3;
}

function inferEmotionalIntensity(scenario: ScenarioDirectorResult): "low" | "moderate" | "high" {
  const emotion = scenario.customer_persona.initial_emotion.toLowerCase();
  if (scenario.difficulty >= 4) return "high";
  if (/(angry|alarmed|panicked|furious|urgent)/.test(emotion)) return "high";
  if (/(calm|curious|neutral)/.test(emotion)) return "low";
  return "moderate";
}

function inferComplexity(scenario: ScenarioDirectorResult): "simple" | "mixed" | "ambiguous" {
  if (scenario.difficulty >= 4) return "ambiguous";
  if ((scenario.hidden_facts?.length ?? 0) >= 2 || (scenario.friction_points?.length ?? 0) >= 2) return "mixed";
  return "simple";
}

function deriveTemplateTitle(brief: string, scenario: ScenarioDirectorResult) {
  const trimmedBrief = brief
    .split("\n")[0]
    ?.trim()
    .replace(/[.?!]+$/, "");

  if (trimmedBrief && trimmedBrief.length >= 8) {
    return trimmedBrief.slice(0, 96);
  }

  const familyLabel = familyLabels[scenario.scenario_family] ?? scenario.scenario_family.replace(/_/g, " ");
  return `${scenario.customer_persona.name} · ${familyLabel}`.slice(0, 96);
}

function splitSupportingContext(value?: string) {
  if (!value?.trim()) return [];
  return value
    .split(/\n|(?<=[.?!])\s+/)
    .map((item) => item.replace(/^[-*•]\s*/, "").trim())
    .filter((item) => item.length >= 10)
    .slice(0, 5);
}

function lineLooksLikeInstruction(line: string) {
  const normalized = normalizeText(line);
  return /(valid|invalid|counts as|should not|must include|what to train|training focus|trust (drops|improves|recovers)|tone|realism|employee should|employee must|manager should|not enough|does not count|do not accept|should be able to|should count)/.test(normalized);
}

function extractHiddenFactsFromSupportingContext(lines: string[]) {
  return lines.filter((line) => !lineLooksLikeInstruction(line)).slice(0, 5);
}

function deriveFallbackHiddenFacts(input: {
  brief: string;
  scenarioFamily: string;
  supportingFacts: string[];
  seedScenario: ScenarioDirectorResult;
}) {
  const normalized = normalizeText(input.brief);
  let derivedFacts: string[];

  if (input.scenarioFamily === "billing_confusion") {
    if (/(monthly program|program payment|monthly payment|autopay)/.test(normalized)) {
      derivedFacts = [
        "The charge is connected to an active recurring program payment on the account.",
        "The member is not sure whether the visible payment activity reflects one payment state or a duplicate charge.",
      ];
    } else if (/(class|registration|enrollment)/.test(normalized)) {
      derivedFacts = [
        "The class registration is active, and the charge is tied to that enrollment.",
        "The member is unsure whether the billing timing or class adjustment was handled correctly.",
      ];
    } else if (/(two|twice|double)/.test(normalized)) {
      derivedFacts = [
        "One charge is pending or still in draft status, and the other is the posted transaction.",
        "The member wants confirmation of whether they were actually charged twice.",
      ];
    } else {
      derivedFacts = [
        "The account shows billing activity the member does not fully understand yet.",
        "The front desk can explain visible status, but billing review may still be needed for account-specific correction.",
      ];
    }
  } else if (input.scenarioFamily === "reservation_issue") {
    derivedFacts = [
      "The member believed the booking was secured, but the reservation record or availability changed.",
      "The customer mainly wants a concrete answer about what can still be honored now.",
    ];
  } else if (input.scenarioFamily === "cancellation_request") {
    derivedFacts = [
      "The member wants the real cancellation process, not a vague redirect.",
      "The employee may need to explain what can happen immediately versus what needs follow-up.",
    ];
  } else if (input.scenarioFamily === "emergency_response") {
    derivedFacts = [
      "The incident needs an immediate controlled response, not a casual explanation.",
      "The customer is judging whether the employee sounds capable of taking control right now.",
    ];
  } else {
    derivedFacts = input.seedScenario.hidden_facts;
  }

  return Array.from(new Set([...derivedFacts, ...input.supportingFacts])).slice(0, 5);
}

function deriveFallbackApprovedResolutionPaths(input: {
  brief: string;
  scenarioFamily: string;
  supportingLines: string[];
  seedScenario: ScenarioDirectorResult;
}) {
  const normalized = normalizeText(input.brief);
  const supportingText = input.supportingLines.join(" ").toLowerCase();

  if (input.scenarioFamily === "billing_confusion") {
    if (/(class|registration|enrollment)/.test(normalized)) {
      return [
        "Confirm whether the class registration is active, explain what the charge covers, and give a concrete follow-up if any adjustment or billing review is still needed.",
      ];
    }
    if (/(monthly program|program payment|monthly payment|autopay)/.test(supportingText) || /(monthly program|program payment|monthly payment|autopay)/.test(normalized)) {
      return [
        "Explain whether the visible activity reflects one recurring program payment or duplicate billing, and give a concrete owner and timeline if billing review is still needed.",
      ];
    }
    return [
      /(owner|timeline|billing)/.test(supportingText)
        ? "Explain what is known about the charge, clarify what is pending versus finalized, and give a billing follow-up with owner, action, and timeline if review is still needed."
        : "Explain what is known about the charge, clarify what is pending versus finalized, and give a concrete follow-up if review is still needed.",
    ];
  }

  if (input.scenarioFamily === "reservation_issue") {
    return [
      "Explain what happened with the booking, confirm what can still be honored, and offer a concrete next step or valid escalation if the reservation cannot be restored.",
    ];
  }

  if (input.scenarioFamily === "cancellation_request") {
    return [
      "Explain the real cancellation process clearly, confirm what can happen today, and give a concrete owner and timeline for any remaining account work.",
    ];
  }

  if (input.scenarioFamily === "emergency_response") {
    return [
      "Take control of the scene, activate the correct safety response, and communicate clearly until emergency help or the proper on-site lead takes over.",
    ];
  }

  if (/(refund|credit)/.test(normalized) || input.scenarioFamily === "refund_credit_request") {
    return [
      "Explain what can be reviewed, own the next step, and provide a concrete review path instead of making a vague promise.",
    ];
  }

  return input.seedScenario.approved_resolution_paths?.length > 0
    ? input.seedScenario.approved_resolution_paths
    : ["Clarify what happened, answer the real concern directly, and give a concrete next step the customer could reasonably accept."];
}

function deriveFallbackRequiredBehaviors(input: {
  scenarioFamily: string;
  seedScenario: ScenarioDirectorResult;
}) {
  const baseBehaviors = ["Answer the core concern directly", "Take ownership of the next step", "Avoid closing before the issue is actually handled"];

  if (input.scenarioFamily === "emergency_response") {
    return [
      "Take control quickly and calmly",
      "Use the correct safety escalation path",
      "Keep communication clear and direct under pressure",
    ];
  }

  return input.seedScenario.required_behaviors?.length > 0
    ? Array.from(new Set([...baseBehaviors, ...input.seedScenario.required_behaviors])).slice(0, 5)
    : baseBehaviors;
}

function deriveFallbackCriticalErrors(input: {
  scenarioFamily: string;
  seedScenario: ScenarioDirectorResult;
}) {
  const baseErrors = [
    "Give a vague reassurance instead of a real answer",
    "Try to end the conversation before the issue is actually handled",
  ];

  if (input.scenarioFamily === "emergency_response") {
    return [
      "Delay the safety response",
      "Minimize the urgency of the incident",
      "Leave the customer without clear control or escalation",
    ];
  }

  return input.seedScenario.critical_errors?.length > 0
    ? Array.from(new Set([...baseErrors, ...input.seedScenario.critical_errors])).slice(0, 5)
    : baseErrors;
}

function deriveFallbackBranchLogic(input: {
  scenarioFamily: string;
  seedScenario: ScenarioDirectorResult;
}) {
  if (input.scenarioFamily === "emergency_response") {
    return {
      if_empathy_is_strong: "Customer cooperates more because the employee sounds calm and in control.",
      if_answer_is_vague: "Customer gets more alarmed and urgent.",
      if_policy_is_wrong: "Customer doubts the employee can handle the incident safely.",
      if_employee_takes_ownership: "Customer stays engaged and follows direction.",
      if_employee_fails_to_help: "Customer demands someone else immediately.",
      if_employee_escalates_correctly: "Customer accepts the handoff because the response feels credible.",
    };
  }

  return {
    ...input.seedScenario.branch_logic,
    if_answer_is_vague: "Customer gets sharper and asks for what is still missing.",
    if_employee_takes_ownership: "Customer stays engaged because the next step sounds real.",
    if_employee_fails_to_help: "Customer questions competence and reopens the missing gap.",
  };
}

function deriveFallbackCompletionRules(input: {
  scenarioFamily: string;
  approvedResolutionPaths: string[];
}) {
  if (input.scenarioFamily === "emergency_response") {
    return {
      resolved_if: ["The employee activates the correct emergency response and keeps the situation under control until the proper handoff occurs."],
      end_early_if: [],
      manager_required_if: ["The situation requires the manager on duty or emergency responders to take over directly."],
    };
  }

  return {
    resolved_if: [
      "The customer receives a direct explanation and either a valid resolution, a concrete accepted next step, or a valid clearly explained escalation.",
      ...input.approvedResolutionPaths.slice(0, 1),
    ],
    end_early_if: [],
    manager_required_if: ["A valid escalation is required because the front-line employee cannot complete the next step alone."],
  };
}

function deriveFallbackOpeningLine(input: {
  brief: string;
  scenarioFamily: string;
  seedScenario: ScenarioDirectorResult;
}) {
  const normalized = normalizeText(input.brief);

  if (input.scenarioFamily === "billing_confusion") {
    if (/(monthly program|program payment|monthly payment|autopay)/.test(normalized)) {
      return "I was looking at my monthly program payment, and something about this billing does not line up.";
    }
    if (/(class|registration|enrollment)/.test(normalized)) {
      return "I signed up for that class, but this charge does not look right to me. Can you walk me through it?";
    }
    if (/(two|twice|double)/.test(normalized)) {
      return "I’m seeing two charges on my account, and I need to know which one is actually real.";
    }
    return "I’m looking at my account and this charge does not make sense to me. What am I actually being billed for?";
  }

  if (input.scenarioFamily === "reservation_issue") {
    return "I booked this already, so why am I being told it is not available now?";
  }

  if (input.scenarioFamily === "cancellation_request") {
    return "I want to cancel this, and I need someone to tell me the real process without sending me in circles.";
  }

  if (input.scenarioFamily === "emergency_response") {
    return "Someone just collapsed over there. I need you to take control right now.";
  }

  return input.seedScenario.opening_line;
}

function deriveFallbackEmotion(brief: string, seedScenario: ScenarioDirectorResult) {
  const normalized = normalizeText(brief);
  if (/(friendly|positive|calm|pleasant)/.test(normalized)) return "concerned";
  if (/(angry|furious|heated|escalated)/.test(normalized)) return "angry";
  if (/(confused|not sure|unclear)/.test(normalized)) return "confused";
  return seedScenario.customer_persona.initial_emotion;
}

function deriveFallbackCommunicationStyle(brief: string, seedScenario: ScenarioDirectorResult) {
  const normalized = normalizeText(brief);
  if (/(friendly|positive|warm)/.test(normalized)) return "Warm at first, but expects clear answers.";
  if (/(detail|specific|organized)/.test(normalized)) return "Detail-oriented and direct.";
  if (/(skeptical|pushback|not convinced)/.test(normalized)) return "Skeptical and fairly direct.";
  return seedScenario.customer_persona.communication_style;
}

function deriveFallbackMembershipContext(brief: string, seedScenario: ScenarioDirectorResult) {
  const normalized = normalizeText(brief);
  if (/(class|program|registration|enrollment)/.test(normalized)) return "Member enrolled in a paid program and checking account activity.";
  if (/(longtime|long-time|long term)/.test(normalized)) return "Longtime member who expects clean operational follow-through.";
  return seedScenario.customer_persona.membership_context;
}

export function inferScenarioBriefHints(input: {
  brief: string;
  supportingContext?: string;
  departmentOverride?: string;
  difficultyOverride?: number;
}): ScenarioBriefHints {
  const combinedText = `${input.brief}\n${input.supportingContext ?? ""}`;
  const familyMatch = inferBestFamilyAcrossDepartments(combinedText);
  const department = (normalizeDepartment(input.departmentOverride) as DepartmentKey | undefined)
    ?? familyMatch?.department
    ?? inferDepartmentFromText(combinedText);
  const scenarioFamily = familyMatch?.department === department
    ? familyMatch?.scenarioFamily
    : inferScenarioFamilyFromText(combinedText, department);
  const difficulty = Math.max(1, Math.min(5, input.difficultyOverride ?? inferDifficultyFromText(combinedText)));

  return {
    department,
    scenarioFamily,
    difficulty,
    employeeRole: departmentRoles[department],
  };
}

export function buildScenarioTemplateInsertFromScenario(input: {
  scenario: ScenarioDirectorResult;
  brief: string;
  createdBy: number;
}): InsertScenarioTemplate {
  const inferredDepartment = (normalizeDepartment(input.scenario.department) as DepartmentKey | undefined) ?? "customer_service";
  const normalizedFamily = normalizePolicyScenarioFamilies([input.scenario.scenario_family])?.[0]
    ?? scenarioFamiliesByDepartment[inferredDepartment][0];

  return {
    title: deriveTemplateTitle(input.brief, input.scenario),
    department: inferredDepartment,
    scenarioFamily: normalizedFamily,
    targetRole: input.scenario.employee_role || departmentRoles[inferredDepartment],
    difficulty: Math.max(1, Math.min(5, input.scenario.difficulty || 3)),
    emotionalIntensity: inferEmotionalIntensity(input.scenario),
    complexity: inferComplexity(input.scenario),
    customerPersona: {
      name: input.scenario.customer_persona.name,
      age_band: input.scenario.customer_persona.age_band,
      membership_context: input.scenario.customer_persona.membership_context,
      communication_style: input.scenario.customer_persona.communication_style,
      initial_emotion: input.scenario.customer_persona.initial_emotion,
      patience_level: input.scenario.customer_persona.patience_level,
    },
    situationSummary: input.scenario.situation_summary,
    openingLine: input.scenario.opening_line,
    hiddenFacts: input.scenario.hidden_facts ?? [],
    approvedResolutionPaths: input.scenario.approved_resolution_paths ?? [],
    requiredBehaviors: input.scenario.required_behaviors ?? [],
    criticalErrors: input.scenario.critical_errors ?? [],
    branchLogic: input.scenario.branch_logic ?? null,
    emotionProgression: input.scenario.emotion_progression ?? null,
    completionRules: input.scenario.completion_rules ?? null,
    recommendedTurns: Math.max(3, Math.min(5, input.scenario.recommended_turns ?? 4)),
    createdBy: input.createdBy,
  };
}

export function buildFallbackScenarioFromBrief(input: {
  brief: string;
  supportingContext?: string;
  hints: ScenarioBriefHints;
  seedScenario: ScenarioDirectorResult;
}) {
  const normalizedFamily = normalizePolicyScenarioFamilies([input.hints.scenarioFamily ?? input.seedScenario.scenario_family])?.[0]
    ?? input.hints.scenarioFamily
    ?? input.seedScenario.scenario_family;
  const supportingLines = splitSupportingContext(input.supportingContext);
  const supportingFacts = extractHiddenFactsFromSupportingContext(supportingLines);
  const approvedResolutionPaths = deriveFallbackApprovedResolutionPaths({
    brief: input.brief,
    scenarioFamily: normalizedFamily,
    supportingLines,
    seedScenario: input.seedScenario,
  });
  const requiredBehaviors = deriveFallbackRequiredBehaviors({
    scenarioFamily: normalizedFamily,
    seedScenario: input.seedScenario,
  });
  const criticalErrors = deriveFallbackCriticalErrors({
    scenarioFamily: normalizedFamily,
    seedScenario: input.seedScenario,
  });

  return scenarioDirectorResultSchema.parse({
    ...input.seedScenario,
    scenario_family: normalizedFamily,
    department: input.hints.department,
    employee_role: input.hints.employeeRole,
    difficulty: input.hints.difficulty,
    situation_summary: input.brief.trim() || input.seedScenario.situation_summary,
    opening_line: deriveFallbackOpeningLine({
      brief: input.brief,
      scenarioFamily: normalizedFamily,
      seedScenario: input.seedScenario,
    }),
    hidden_facts: deriveFallbackHiddenFacts({
      brief: input.brief,
      scenarioFamily: normalizedFamily,
      supportingFacts,
      seedScenario: input.seedScenario,
    }),
    customer_persona: {
      ...input.seedScenario.customer_persona,
      membership_context: deriveFallbackMembershipContext(input.brief, input.seedScenario),
      communication_style: deriveFallbackCommunicationStyle(input.brief, input.seedScenario),
      initial_emotion: deriveFallbackEmotion(input.brief, input.seedScenario),
    },
    approved_resolution_paths: approvedResolutionPaths,
    required_behaviors: requiredBehaviors,
    critical_errors: criticalErrors,
    branch_logic: deriveFallbackBranchLogic({
      scenarioFamily: normalizedFamily,
      seedScenario: input.seedScenario,
    }),
    completion_rules: deriveFallbackCompletionRules({
      scenarioFamily: normalizedFamily,
      approvedResolutionPaths,
    }),
  });
}

export function buildBriefGenerationLabel(hints: ScenarioBriefHints) {
  const family = hints.scenarioFamily ? familyLabels[hints.scenarioFamily] ?? hints.scenarioFamily.replace(/_/g, " ") : "Auto-picked family";
  return `${departmentLabels[hints.department]} · ${family}`;
}
