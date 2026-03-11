import { familyLabels, getScenarioGoal } from "../../shared/wsc-content";

const STOP_WORDS = new Set([
  "about",
  "after",
  "against",
  "arrives",
  "being",
  "clear",
  "club",
  "control",
  "customer",
  "during",
  "employee",
  "explain",
  "front",
  "going",
  "have",
  "into",
  "issue",
  "member",
  "must",
  "next",
  "only",
  "path",
  "real",
  "right",
  "role",
  "scenario",
  "service",
  "should",
  "step",
  "take",
  "that",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "until",
  "what",
  "with",
  "woodinville",
]);

export type PolicyCandidate = {
  id?: number;
  title: string;
  department?: string | null;
  scenarioFamilies?: string[] | null;
  content: string;
  version?: number | null;
};

export type PolicyScenarioInput = {
  department?: string | null;
  scenarioFamily?: string | null;
  scenarioTitle?: string | null;
  situationSummary?: string | null;
  openingLine?: string | null;
  requiredBehaviors?: string[] | null;
  criticalErrors?: string[] | null;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePolicyScenarioFamilies(values?: string[] | null) {
  if (!values || values.length === 0) return null;

  const normalized = Array.from(
    new Set(
      values
        .map((value) => normalizeText(value))
        .filter(Boolean),
    ),
  );

  return normalized.length > 0 ? normalized : null;
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function buildScenarioTerms(input: PolicyScenarioInput) {
  const scenarioFamily = input.scenarioFamily ? normalizeText(input.scenarioFamily) : "";
  const familyLabel = scenarioFamily ? familyLabels[scenarioFamily] ?? scenarioFamily.replace(/_/g, " ") : "";
  const goal = getScenarioGoal({
    department: input.department,
    scenario_family: scenarioFamily || null,
  });

  const rawValues = [
    familyLabel,
    scenarioFamily.replace(/_/g, " "),
    input.scenarioTitle ?? "",
    input.situationSummary ?? "",
    input.openingLine ?? "",
    ...(input.requiredBehaviors ?? []),
    ...(input.criticalErrors ?? []),
    goal.title,
    goal.description,
  ].filter(Boolean);

  const phrases = new Set(
    rawValues
      .map((value) => value.toLowerCase().trim())
      .filter((value) => value.length >= 4),
  );

  const tokens = new Set(rawValues.flatMap((value) => tokenize(value)));

  return { phrases, tokens, scenarioFamily };
}

export function scorePolicyForScenario(policy: PolicyCandidate, input: PolicyScenarioInput) {
  const normalizedFamilies = normalizePolicyScenarioFamilies(policy.scenarioFamilies);
  const { phrases, tokens, scenarioFamily } = buildScenarioTerms(input);
  const haystack = `${policy.title}\n${policy.content}`.toLowerCase();
  const title = policy.title.toLowerCase();

  if (input.department && policy.department && policy.department !== input.department) {
    return Number.NEGATIVE_INFINITY;
  }

  if (scenarioFamily && normalizedFamilies && normalizedFamilies.length > 0 && !normalizedFamilies.includes(scenarioFamily)) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 0;

  if (input.department && policy.department === input.department) {
    score += 24;
  } else if (!policy.department) {
    score += 8;
  }

  if (scenarioFamily && normalizedFamilies?.includes(scenarioFamily)) {
    score += 120;
  } else if (!normalizedFamilies || normalizedFamilies.length === 0) {
    score += 6;
  }

  for (const phrase of Array.from(phrases)) {
    if (phrase.length < 6) continue;
    if (title.includes(phrase)) score += 10;
    else if (haystack.includes(phrase)) score += 5;
  }

  for (const token of Array.from(tokens)) {
    if (title.includes(token)) score += 4;
    else if (haystack.includes(token)) score += 2;
  }

  return score;
}

export function selectRelevantPolicies<T extends PolicyCandidate>(policies: T[], input: PolicyScenarioInput, limit = 4) {
  const scored = policies
    .map((policy) => ({ policy, score: scorePolicyForScenario(policy, input) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.policy.version ?? 1) - (a.policy.version ?? 1);
    });

  if (scored.length === 0) return [];

  const topScore = scored[0].score;
  const familyMatched = normalizePolicyScenarioFamilies(scored[0].policy.scenarioFamilies)?.includes(
    normalizeText(input.scenarioFamily ?? ""),
  );

  const minimumScore = familyMatched ? Math.max(20, topScore - 30) : Math.max(12, topScore - 18);

  return scored
    .filter((entry, index) => index === 0 || entry.score >= minimumScore)
    .slice(0, limit)
    .map((entry) => entry.policy);
}
