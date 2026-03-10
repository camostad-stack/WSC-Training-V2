import { READINESS_STATUSES, SESSION_QUALITY_VALUES, TRENDS } from "../../drizzle/schema";

const DEPARTMENT_MAP: Record<string, string> = {
  "customer service": "customer_service",
  customer_service: "customer_service",
  golf: "golf",
  "golf / sales-service": "golf",
  "golf/sales-service": "golf",
  "golf services": "golf",
  "mod / emergency": "mod_emergency",
  "mod/emergency": "mod_emergency",
  "mod / facilities": "mod_emergency",
  "mod / emergency / facilities-adjacent": "mod_emergency",
  mod_emergency: "mod_emergency",
};

const READINESS_MAP: Record<string, string> = {
  not_ready: "not_ready",
  "not ready": "not_ready",
  practice_more: "practice_more",
  "practice more": "practice_more",
  shadow_ready: "shadow_ready",
  "shadow ready": "shadow_ready",
  partially_independent: "partially_independent",
  "partially independent": "partially_independent",
  independent: "independent",
};

const SESSION_QUALITY_MAP: Record<string, string> = {
  usable: "usable",
  questionable: "questionable",
  invalid: "invalid",
  unreliable_for_scoring: "questionable",
  reliable: "usable",
};

const PASS_FAIL_VALUES = new Set(["pass", "borderline", "fail"]);

export function normalizeDepartment(value?: string | null) {
  if (!value) return undefined;
  return DEPARTMENT_MAP[value.toLowerCase()];
}

export function normalizePassFail(value?: string | null) {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z]/g, "");
  return PASS_FAIL_VALUES.has(normalized) ? normalized : undefined;
}

export function normalizeReadinessSignal(value?: string | null) {
  if (!value) return undefined;
  const lowered = value.toLowerCase();
  return (
    READINESS_MAP[lowered.split(" - ")[0].trim()] ??
    READINESS_MAP[lowered.replace(/[^a-z_ ]/g, "").trim()] ??
    undefined
  );
}

export function normalizeSessionQuality(value?: string | null) {
  if (!value) return undefined;
  return SESSION_QUALITY_MAP[value.toLowerCase()];
}

export function normalizeProfileReadiness(value: string) {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (READINESS_STATUSES.includes(lower as (typeof READINESS_STATUSES)[number])) {
    return lower;
  }
  if (lower.includes("independent") && !lower.includes("partial")) return "independent";
  if (lower.includes("partial")) return "partially_independent";
  if (lower.includes("shadow") || lower.includes("ready_with") || lower.includes("minor")) return "shadow_ready";
  if (lower.includes("practice") || lower.includes("more")) return "practice_more";
  return "not_ready";
}

export function normalizeProfileTrend(value: string) {
  const lower = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (TRENDS.includes(lower as (typeof TRENDS)[number])) {
    return lower;
  }
  if (lower.includes("improv") || lower.includes("up")) return "improving";
  if (lower.includes("declin") || lower.includes("down")) return "declining";
  if (lower.includes("accel")) return "improving";
  return "flat";
}
