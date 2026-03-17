export const LONGITUDINAL_COMPETENCY_ORDER = [
  "business_operations",
  "drive_self_motivation",
  "reliability_consistency",
  "proactivity_initiative",
  "work_ethic",
  "problem_solving_adaptability",
  "community_builder",
] as const;

export type LongitudinalCompetencyKey = (typeof LONGITUDINAL_COMPETENCY_ORDER)[number];
export type LongitudinalTrend = "up" | "steady" | "down";
export type LongitudinalConfidence = "emerging" | "developing" | "established";

export interface LongitudinalCompetencyMeta {
  label: string;
  description: string;
  simulator_observable: boolean;
  manager_confirmation_needed: boolean;
}

export interface LongitudinalCompetencySignal {
  score: number;
  trend: LongitudinalTrend;
  summary: string;
}

export interface LongitudinalGrowthProfile {
  framework_name: string;
  summary: string;
  stage_level: number;
  stage_label: string;
  stage_summary: string;
  confidence: LongitudinalConfidence;
  evidence_window_sessions: number;
  competencies: Record<LongitudinalCompetencyKey, LongitudinalCompetencySignal>;
  development_priorities: string[];
  manager_observation_focus: string[];
}

export const LONGITUDINAL_COMPETENCY_META: Record<LongitudinalCompetencyKey, LongitudinalCompetencyMeta> = {
  business_operations: {
    label: "Business Operations",
    description: "Handles routine member-service work with sound service basics, club knowledge, and practical control.",
    simulator_observable: true,
    manager_confirmation_needed: false,
  },
  drive_self_motivation: {
    label: "Drive & Self-Motivation",
    description: "Shows initiative, follow-through, and self-direction without waiting to be rescued.",
    simulator_observable: false,
    manager_confirmation_needed: true,
  },
  reliability_consistency: {
    label: "Reliability & Consistency",
    description: "Delivers steady execution under pressure and holds a dependable service standard over time.",
    simulator_observable: false,
    manager_confirmation_needed: true,
  },
  proactivity_initiative: {
    label: "Proactivity & Initiative",
    description: "Moves the issue forward before the member has to keep pulling for action.",
    simulator_observable: true,
    manager_confirmation_needed: false,
  },
  work_ethic: {
    label: "Work Ethic",
    description: "Shows sustained professionalism, effort, and accountability beyond a single call moment.",
    simulator_observable: false,
    manager_confirmation_needed: true,
  },
  problem_solving_adaptability: {
    label: "Problem Solving & Adaptability",
    description: "Uses sound judgment, adjusts when the situation changes, and keeps the outcome practical.",
    simulator_observable: true,
    manager_confirmation_needed: false,
  },
  community_builder: {
    label: "Community Builder",
    description: "Builds trust and connection in a way that reflects strong member-facing culture.",
    simulator_observable: true,
    manager_confirmation_needed: false,
  },
};

export const LONGITUDINAL_STAGE_LABELS = [
  "Level 1 (Beginner)",
  "Level 2 (Novice)",
  "Level 3 (Proficient)",
  "Level 4 (Skilled)",
  "Level 5 (Advanced)",
  "Level 6 (Expert)",
  "Level 7 (Leader)",
] as const;

const DEFAULT_COMPETENCY_SIGNAL: LongitudinalCompetencySignal = {
  score: 0,
  trend: "steady",
  summary: "No longitudinal evidence yet.",
};

export const DEFAULT_LONGITUDINAL_PROFILE: LongitudinalGrowthProfile = {
  framework_name: "WSC Service Growth Profile v1",
  summary:
    "This profile tracks longer-term service growth across repeated sessions. It should guide development over time, not replace the call score for one interaction.",
  stage_level: 1,
  stage_label: LONGITUDINAL_STAGE_LABELS[0],
  stage_summary: "Early in the growth curve. Focus on service basics, steady ownership, and repeatable member handling.",
  confidence: "emerging",
  evidence_window_sessions: 0,
  competencies: LONGITUDINAL_COMPETENCY_ORDER.reduce((result, key) => {
    result[key] = { ...DEFAULT_COMPETENCY_SIGNAL };
    return result;
  }, {} as Record<LongitudinalCompetencyKey, LongitudinalCompetencySignal>),
  development_priorities: [],
  manager_observation_focus: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampPercent(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeTrend(value: unknown): LongitudinalTrend {
  return value === "up" || value === "down" || value === "steady" ? value : "steady";
}

function normalizeConfidence(value: unknown): LongitudinalConfidence {
  return value === "developing" || value === "established" || value === "emerging" ? value : "emerging";
}

export function getLongitudinalStageDefinition(level: number) {
  const safeLevel = Math.max(1, Math.min(7, Math.round(level)));
  const index = safeLevel - 1;
  const summaries = [
    "Early in the growth curve. Focus on service basics, steady ownership, and repeatable member handling.",
    "Building routine competence. Still needs reinforcement around consistency and proactive control.",
    "Can handle common member situations independently with coachable gaps under pressure.",
    "Handles most interactions with dependable service judgment, practical ownership, and calm control.",
    "Shows strong independent service judgment and can recover harder calls without losing the member.",
    "Demonstrates expert-level pattern recognition, service recovery, and operational judgment over time.",
    "Consistently models the service standard and shapes how others handle members.",
  ] as const;

  return {
    stage_level: safeLevel,
    stage_label: LONGITUDINAL_STAGE_LABELS[index],
    stage_summary: summaries[index],
  };
}

export function getLongitudinalStageLevelFromScore(score: number) {
  if (score >= 97) return 7;
  if (score >= 88) return 6;
  if (score >= 75) return 5;
  if (score >= 60) return 4;
  if (score >= 45) return 3;
  if (score >= 30) return 2;
  return 1;
}

export function normalizeLongitudinalProfile(value: unknown): LongitudinalGrowthProfile {
  if (!isRecord(value)) {
    return DEFAULT_LONGITUDINAL_PROFILE;
  }

  const competencies = LONGITUDINAL_COMPETENCY_ORDER.reduce((result, key) => {
    const source = isRecord(value.competencies) && isRecord(value.competencies[key]) ? value.competencies[key] : {};
    result[key] = {
      score: clampPercent(source.score),
      trend: normalizeTrend(source.trend),
      summary: typeof source.summary === "string" && source.summary.trim().length > 0
        ? source.summary.trim()
        : DEFAULT_COMPETENCY_SIGNAL.summary,
    };
    return result;
  }, {} as Record<LongitudinalCompetencyKey, LongitudinalCompetencySignal>);

  const stageDefinition = getLongitudinalStageDefinition(
    typeof value.stage_level === "number"
      ? value.stage_level
      : DEFAULT_LONGITUDINAL_PROFILE.stage_level,
  );

  return {
    framework_name: typeof value.framework_name === "string" && value.framework_name.trim().length > 0
      ? value.framework_name.trim()
      : DEFAULT_LONGITUDINAL_PROFILE.framework_name,
    summary: typeof value.summary === "string" && value.summary.trim().length > 0
      ? value.summary.trim()
      : DEFAULT_LONGITUDINAL_PROFILE.summary,
    stage_level: stageDefinition.stage_level,
    stage_label: stageDefinition.stage_label,
    stage_summary: stageDefinition.stage_summary,
    confidence: normalizeConfidence(value.confidence),
    evidence_window_sessions: typeof value.evidence_window_sessions === "number" && Number.isFinite(value.evidence_window_sessions)
      ? Math.max(0, Math.round(value.evidence_window_sessions))
      : DEFAULT_LONGITUDINAL_PROFILE.evidence_window_sessions,
    competencies,
    development_priorities: Array.isArray(value.development_priorities)
      ? value.development_priorities.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
    manager_observation_focus: Array.isArray(value.manager_observation_focus)
      ? value.manager_observation_focus.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [],
  };
}

export function getLongitudinalCompetencyEntries(profile: LongitudinalGrowthProfile) {
  const normalized = normalizeLongitudinalProfile(profile);
  return LONGITUDINAL_COMPETENCY_ORDER.map((key) => ({
    key,
    ...LONGITUDINAL_COMPETENCY_META[key],
    ...normalized.competencies[key],
  }));
}

export function deriveLegacyLongitudinalProfileFallback(input: {
  levelEstimate?: string | null;
  totalSessions?: number | null;
  consistencyScore?: number | null;
  skillMap?: Record<string, number> | null;
}) {
  const skillMap = input.skillMap || {};
  const empathy = clampPercent((skillMap.empathy || 0) * 10);
  const clarity = clampPercent((skillMap.clarity || 0) * 10);
  const policyAccuracy = clampPercent((skillMap.policy_accuracy || 0) * 10);
  const ownership = clampPercent((skillMap.ownership || 0) * 10);
  const deEscalation = clampPercent((skillMap.de_escalation || 0) * 10);
  const escalationJudgment = clampPercent((skillMap.escalation_judgment || 0) * 10);
  const professionalPresence = clampPercent((skillMap.professional_presence || 0) * 10);
  const consistencyScore = clampPercent(input.consistencyScore ?? average([professionalPresence, ownership]));

  const competencies = {
    business_operations: average([clarity, policyAccuracy, ownership]),
    drive_self_motivation: average([ownership, professionalPresence]),
    reliability_consistency: average([consistencyScore, professionalPresence, clarity]),
    proactivity_initiative: average([ownership, escalationJudgment]),
    work_ethic: average([consistencyScore, professionalPresence]),
    problem_solving_adaptability: average([policyAccuracy, escalationJudgment, clarity]),
    community_builder: average([empathy, deEscalation, professionalPresence]),
  };

  const observableAverage = average([
    competencies.business_operations,
    competencies.proactivity_initiative,
    competencies.problem_solving_adaptability,
    competencies.community_builder,
  ]);
  const stageDefinition = getLongitudinalStageDefinition(getLongitudinalStageLevelFromScore(observableAverage));

  return normalizeLongitudinalProfile({
    framework_name: DEFAULT_LONGITUDINAL_PROFILE.framework_name,
    summary: DEFAULT_LONGITUDINAL_PROFILE.summary,
    stage_level: stageDefinition.stage_level,
    stage_label: stageDefinition.stage_label,
    stage_summary: stageDefinition.stage_summary,
    confidence: (input.totalSessions || 0) >= 10 ? "established" : (input.totalSessions || 0) >= 4 ? "developing" : "emerging",
    evidence_window_sessions: input.totalSessions || 0,
    competencies: LONGITUDINAL_COMPETENCY_ORDER.reduce((result, key) => {
      result[key] = {
        score: clampPercent(competencies[key]),
        trend: "steady",
        summary: LONGITUDINAL_COMPETENCY_META[key].manager_confirmation_needed
          ? "Backfilled from legacy profile data. Manager observation should confirm this signal."
          : "Backfilled from prior practice signals until newer longitudinal evidence accumulates.",
      };
      return result;
    }, {} as Record<LongitudinalCompetencyKey, LongitudinalCompetencySignal>),
    development_priorities: [],
    manager_observation_focus: LONGITUDINAL_COMPETENCY_ORDER
      .filter((key) => LONGITUDINAL_COMPETENCY_META[key].manager_confirmation_needed)
      .map((key) => LONGITUDINAL_COMPETENCY_META[key].label),
  });
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
