export const EVALUATION_DIMENSION_ORDER = [
  "member_connection",
  "listening_discovery",
  "ownership_accountability",
  "problem_solving_policy",
  "clarity_expectation_setting",
  "resolution_control",
] as const;

export const LEGACY_EVALUATION_DIMENSION_ORDER = [
  "interaction_quality",
  "operational_effectiveness",
  "outcome_quality",
] as const;

export type EvaluationDimensionKey = (typeof EVALUATION_DIMENSION_ORDER)[number];
export type LegacyEvaluationDimensionKey = (typeof LEGACY_EVALUATION_DIMENSION_ORDER)[number];
export type EvaluationScoreDimensions = Record<EvaluationDimensionKey, number>;

export interface EvaluationRubricDimensionMeta {
  label: string;
  description: string;
  why_it_matters: string;
}

export interface EvaluationRubricBand {
  key: string;
  label: string;
  min: number;
  max: number;
  summary: string;
}

export interface EvaluationRubricPenalty {
  key: string;
  label: string;
  description: string;
  overall_cap?: number;
  dimension_caps?: Partial<Record<EvaluationDimensionKey, number>>;
}

export interface EvaluationRubric {
  name: string;
  summary: string;
  dimension_order: EvaluationDimensionKey[];
  dimension_weights: Record<EvaluationDimensionKey, number>;
  dimension_meta: Record<EvaluationDimensionKey, EvaluationRubricDimensionMeta>;
  overall_bands: EvaluationRubricBand[];
  hard_penalties: EvaluationRubricPenalty[];
  competency_signals: string[];
}

const DEFAULT_ZERO_SCORE_DIMENSIONS: EvaluationScoreDimensions = {
  member_connection: 0,
  listening_discovery: 0,
  ownership_accountability: 0,
  problem_solving_policy: 0,
  clarity_expectation_setting: 0,
  resolution_control: 0,
};

export const DEFAULT_EVALUATION_RUBRIC: EvaluationRubric = {
  name: "WSC Member Service Interaction Rubric v1",
  summary:
    "Score the call on how well the employee connected with the member, understood the issue, owned the next step, used sound judgment, set expectations clearly, and landed a real outcome.",
  dimension_order: [...EVALUATION_DIMENSION_ORDER],
  dimension_weights: {
    member_connection: 15,
    listening_discovery: 15,
    ownership_accountability: 20,
    problem_solving_policy: 20,
    clarity_expectation_setting: 15,
    resolution_control: 15,
  },
  dimension_meta: {
    member_connection: {
      label: "Member Connection & Professionalism",
      description: "How respectful, calm, and member-centered the interaction felt.",
      why_it_matters: "Members stay engaged when they feel handled by a real professional, not brushed off or talked down to.",
    },
    listening_discovery: {
      label: "Listening & Discovery",
      description: "How well you understood the real issue and responded to what the member actually needed.",
      why_it_matters: "You cannot solve the right problem if the member has to keep repeating or clarifying the same concern.",
    },
    ownership_accountability: {
      label: "Ownership & Accountability",
      description: "How clearly you owned the next step, named responsibility, and kept the issue from floating.",
      why_it_matters: "Members lose trust when no one seems responsible for what happens next.",
    },
    problem_solving_policy: {
      label: "Problem Solving & Policy Judgment",
      description: "How operationally sound your answer was, including policy use, escalation judgment, and practical solution quality.",
      why_it_matters: "Good service still fails if the answer is wrong, risky, or operationally weak.",
    },
    clarity_expectation_setting: {
      label: "Clarity & Expectation Setting",
      description: "How clearly you explained what is happening, what comes next, and what the member should expect.",
      why_it_matters: "Clear expectations reduce repeat calls, confusion, and avoidable frustration.",
    },
    resolution_control: {
      label: "Resolution / Next-Step Control",
      description: "Whether the conversation actually landed in a clean result, accepted next step, or valid escalation handoff.",
      why_it_matters: "A calm call still misses if the issue stays materially open at the end.",
    },
  },
  overall_bands: [
    {
      key: "excellent",
      label: "Excellent",
      min: 90,
      max: 100,
      summary: "Strong member handling with clear ownership, sound judgment, and a clean outcome.",
    },
    {
      key: "strong",
      label: "Strong",
      min: 80,
      max: 89,
      summary: "Solid performance with only minor coaching needs.",
    },
    {
      key: "acceptable",
      label: "Acceptable / Coachable",
      min: 70,
      max: 79,
      summary: "Usable performance, but still inconsistent in one or two important areas.",
    },
    {
      key: "needs_work",
      label: "Needs Work",
      min: 60,
      max: 69,
      summary: "The interaction had some useful moments, but the outcome or ownership was not reliable enough.",
    },
    {
      key: "not_ready",
      label: "Not Ready",
      min: 0,
      max: 59,
      summary: "The member interaction broke down materially or failed to land in a usable outcome.",
    },
  ],
  hard_penalties: [
    {
      key: "critical_failure",
      label: "Critical Failure",
      description: "Used disrespectful, fabricated, risky, or blaming language that materially undermined service handling.",
      overall_cap: 50,
    },
    {
      key: "premature_closure",
      label: "Premature Closure",
      description: "Tried to close before the issue was actually resolved or before a valid next step was accepted.",
      overall_cap: 69,
      dimension_caps: {
        resolution_control: 20,
      },
    },
    {
      key: "no_real_ownership",
      label: "No Real Ownership",
      description: "Did not clearly own the next step with a usable owner, action, or timeline.",
      dimension_caps: {
        ownership_accountability: 40,
      },
    },
  ],
  competency_signals: [
    "Member Communication",
    "Listening & Understanding",
    "Ownership & Follow-Through",
    "Operational Judgment",
    "Service Recovery",
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getZeroEvaluationScoreDimensions(): EvaluationScoreDimensions {
  return { ...DEFAULT_ZERO_SCORE_DIMENSIONS };
}

function hasCurrentScoreDimensions(value: Record<string, unknown>) {
  return EVALUATION_DIMENSION_ORDER.some((key) => typeof value[key] === "number");
}

function hasLegacyScoreDimensions(value: Record<string, unknown>) {
  return LEGACY_EVALUATION_DIMENSION_ORDER.some((key) => typeof value[key] === "number");
}

export function normalizeEvaluationScoreDimensions(value: unknown): EvaluationScoreDimensions {
  if (!isRecord(value)) return getZeroEvaluationScoreDimensions();

  if (hasCurrentScoreDimensions(value)) {
    return {
      member_connection: clampPercent(value.member_connection),
      listening_discovery: clampPercent(value.listening_discovery),
      ownership_accountability: clampPercent(value.ownership_accountability),
      problem_solving_policy: clampPercent(value.problem_solving_policy),
      clarity_expectation_setting: clampPercent(value.clarity_expectation_setting),
      resolution_control: clampPercent(value.resolution_control),
    };
  }

  if (!hasLegacyScoreDimensions(value)) return getZeroEvaluationScoreDimensions();

  const interactionQuality = clampPercent(value.interaction_quality);
  const operationalEffectiveness = clampPercent(value.operational_effectiveness);
  const outcomeQuality = clampPercent(value.outcome_quality);

  return {
    member_connection: interactionQuality,
    listening_discovery: clampPercent((interactionQuality * 0.7) + (operationalEffectiveness * 0.3)),
    ownership_accountability: operationalEffectiveness,
    problem_solving_policy: operationalEffectiveness,
    clarity_expectation_setting: clampPercent((interactionQuality * 0.4) + (operationalEffectiveness * 0.6)),
    resolution_control: outcomeQuality,
  };
}

export function normalizeEvaluationRubric(value: unknown): EvaluationRubric {
  if (!isRecord(value) || !isRecord(value.dimension_weights)) {
    return DEFAULT_EVALUATION_RUBRIC;
  }

  const dimensionWeights = value.dimension_weights as Record<string, unknown>;

  const hasCurrentWeights = EVALUATION_DIMENSION_ORDER.some((key) => typeof dimensionWeights[key] === "number");
  const hasLegacyWeights = LEGACY_EVALUATION_DIMENSION_ORDER.some((key) => typeof dimensionWeights[key] === "number");

  if (!hasCurrentWeights && hasLegacyWeights) {
    return DEFAULT_EVALUATION_RUBRIC;
  }

  const weights = {
    member_connection: clampPercent(dimensionWeights.member_connection),
    listening_discovery: clampPercent(dimensionWeights.listening_discovery),
    ownership_accountability: clampPercent(dimensionWeights.ownership_accountability),
    problem_solving_policy: clampPercent(dimensionWeights.problem_solving_policy),
    clarity_expectation_setting: clampPercent(dimensionWeights.clarity_expectation_setting),
    resolution_control: clampPercent(dimensionWeights.resolution_control),
  };
  const total = Object.values(weights).reduce((sum, entry) => sum + entry, 0);
  const dimensionOrder = Array.isArray(value.dimension_order)
    && value.dimension_order.length === EVALUATION_DIMENSION_ORDER.length
    && value.dimension_order.every((entry) => typeof entry === "string" && EVALUATION_DIMENSION_ORDER.includes(entry as EvaluationDimensionKey))
    ? [...value.dimension_order] as EvaluationDimensionKey[]
    : DEFAULT_EVALUATION_RUBRIC.dimension_order;

  const dimensionMeta = EVALUATION_DIMENSION_ORDER.reduce((result, key) => {
    const source = isRecord(value.dimension_meta) && isRecord(value.dimension_meta[key]) ? value.dimension_meta[key] : {};
    result[key] = {
      label: typeof source.label === "string" && source.label.trim().length > 0
        ? source.label.trim()
        : DEFAULT_EVALUATION_RUBRIC.dimension_meta[key].label,
      description: typeof source.description === "string" && source.description.trim().length > 0
        ? source.description.trim()
        : DEFAULT_EVALUATION_RUBRIC.dimension_meta[key].description,
      why_it_matters: typeof source.why_it_matters === "string" && source.why_it_matters.trim().length > 0
        ? source.why_it_matters.trim()
        : DEFAULT_EVALUATION_RUBRIC.dimension_meta[key].why_it_matters,
    };
    return result;
  }, {} as EvaluationRubric["dimension_meta"]);

  const overallBands = Array.isArray(value.overall_bands)
    && value.overall_bands.every((entry) =>
      isRecord(entry)
      && typeof entry.key === "string"
      && typeof entry.label === "string"
      && typeof entry.min === "number"
      && typeof entry.max === "number"
      && typeof entry.summary === "string",
    )
    ? value.overall_bands.map((entry) => ({
      key: String(entry.key).trim(),
      label: String(entry.label).trim(),
      min: clampPercent(entry.min),
      max: clampPercent(entry.max),
      summary: String(entry.summary).trim(),
    }))
    : DEFAULT_EVALUATION_RUBRIC.overall_bands;

  const hardPenalties = Array.isArray(value.hard_penalties)
    && value.hard_penalties.every((entry) => isRecord(entry) && typeof entry.key === "string" && typeof entry.label === "string" && typeof entry.description === "string")
    ? value.hard_penalties.map((entry) => ({
      key: String(entry.key).trim(),
      label: String(entry.label).trim(),
      description: String(entry.description).trim(),
      overall_cap: typeof entry.overall_cap === "number" ? clampPercent(entry.overall_cap) : undefined,
      dimension_caps: isRecord(entry.dimension_caps)
        ? EVALUATION_DIMENSION_ORDER.reduce((result, key) => {
          if (typeof entry.dimension_caps[key] === "number") {
            result[key] = clampPercent(entry.dimension_caps[key]);
          }
          return result;
        }, {} as Partial<Record<EvaluationDimensionKey, number>>)
        : undefined,
    }))
    : DEFAULT_EVALUATION_RUBRIC.hard_penalties;

  const competencySignals = Array.isArray(value.competency_signals)
    ? value.competency_signals.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : DEFAULT_EVALUATION_RUBRIC.competency_signals;

  return {
    ...DEFAULT_EVALUATION_RUBRIC,
    name: typeof value.name === "string" && value.name.trim().length > 0
      ? value.name.trim()
      : DEFAULT_EVALUATION_RUBRIC.name,
    summary: typeof value.summary === "string" && value.summary.trim().length > 0
      ? value.summary.trim()
      : DEFAULT_EVALUATION_RUBRIC.summary,
    dimension_order: dimensionOrder,
    dimension_weights: total === 0 ? DEFAULT_EVALUATION_RUBRIC.dimension_weights : weights,
    dimension_meta: dimensionMeta,
    overall_bands: overallBands,
    hard_penalties: hardPenalties,
    competency_signals: competencySignals,
  };
}

export function getEvaluationDimensionEntries(params: {
  scoreDimensions: unknown;
  rubric?: unknown;
}) {
  const scoreDimensions = normalizeEvaluationScoreDimensions(params.scoreDimensions);
  const rubric = normalizeEvaluationRubric(params.rubric);

  return rubric.dimension_order.map((key) => ({
    key,
    score: scoreDimensions[key],
    weight: rubric.dimension_weights[key],
    ...rubric.dimension_meta[key],
  }));
}

export function getEvaluationOverallBand(params: {
  overallScore: number;
  rubric?: unknown;
}) {
  const rubric = normalizeEvaluationRubric(params.rubric);
  const score = clampPercent(params.overallScore);

  return rubric.overall_bands.find((band) => score >= band.min && score <= band.max)
    || rubric.overall_bands[rubric.overall_bands.length - 1];
}

export function getInteractionCoverageScore(scoreDimensions: unknown) {
  if (isRecord(scoreDimensions) && !hasCurrentScoreDimensions(scoreDimensions) && hasLegacyScoreDimensions(scoreDimensions)) {
    return clampPercent(scoreDimensions.interaction_quality);
  }

  const scores = normalizeEvaluationScoreDimensions(scoreDimensions);
  return clampPercent(
    (scores.member_connection + scores.listening_discovery + scores.clarity_expectation_setting) / 3,
  );
}

export function getResolutionControlScore(scoreDimensions: unknown) {
  if (isRecord(scoreDimensions) && !hasCurrentScoreDimensions(scoreDimensions) && hasLegacyScoreDimensions(scoreDimensions)) {
    return clampPercent(scoreDimensions.outcome_quality);
  }

  return normalizeEvaluationScoreDimensions(scoreDimensions).resolution_control;
}
