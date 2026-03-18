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

export function inferScenarioBriefHints(input: {
  brief: string;
  supportingContext?: string;
  departmentOverride?: string;
  difficultyOverride?: number;
}): ScenarioBriefHints {
  const combinedText = `${input.brief}\n${input.supportingContext ?? ""}`;
  const department = (normalizeDepartment(input.departmentOverride) as DepartmentKey | undefined)
    ?? inferDepartmentFromText(combinedText);
  const scenarioFamily = inferScenarioFamilyFromText(combinedText, department);
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
  hints: ScenarioBriefHints;
  seedScenario: ScenarioDirectorResult;
}) {
  const normalizedFamily = normalizePolicyScenarioFamilies([input.seedScenario.scenario_family])?.[0]
    ?? input.hints.scenarioFamily
    ?? input.seedScenario.scenario_family;

  return scenarioDirectorResultSchema.parse({
    ...input.seedScenario,
    scenario_family: normalizedFamily,
    department: input.hints.department,
    employee_role: input.hints.employeeRole,
    difficulty: input.hints.difficulty,
    situation_summary: input.brief.trim() || input.seedScenario.situation_summary,
  });
}

export function buildBriefGenerationLabel(hints: ScenarioBriefHints) {
  const family = hints.scenarioFamily ? familyLabels[hints.scenarioFamily] ?? hints.scenarioFamily.replace(/_/g, " ") : "Auto-picked family";
  return `${departmentLabels[hints.department]} · ${family}`;
}
