import {
  departmentLabels as sharedDepartmentLabels,
  departmentRoles as sharedDepartmentRoles,
  familyLabels as sharedFamilyLabels,
  scenarioFamiliesByDepartment,
} from "@shared/wsc-content";
import type { SimulatorConfig } from "./types";

export const departmentLabels = sharedDepartmentLabels;
export const departmentRoles = sharedDepartmentRoles;
export const familyLabels = sharedFamilyLabels;
export const scenarioFamilies = scenarioFamiliesByDepartment;

const departmentAliases: Record<string, keyof typeof departmentLabels> = {
  "customer service": "customer_service",
  customer_service: "customer_service",
  golf: "golf",
  "golf / sales-service": "golf",
  "golf / sales-service hybrid": "golf",
  "golf/sales-service": "golf",
  "golf services": "golf",
  mod_emergency: "mod_emergency",
  "mod / emergency": "mod_emergency",
  "mod/emergency": "mod_emergency",
  "mod / facilities": "mod_emergency",
  "mod / emergency / facilities-adjacent": "mod_emergency",
};

export const activeAssignmentStatuses = new Set(["assigned", "in_progress"]);

export function normalizeDepartmentKey(value?: string) {
  if (!value) return "customer_service";
  return departmentAliases[value.toLowerCase()] ?? "customer_service";
}

export function getDepartmentLabel(value?: string) {
  return departmentLabels[normalizeDepartmentKey(value)];
}

export function getRoleForDepartment(value?: string) {
  return departmentRoles[normalizeDepartmentKey(value)];
}

export function clampDifficulty(value: number, min = 1, max = 5) {
  return Math.max(min, Math.min(max, value));
}

export function getDifficultyRange(config: SimulatorConfig) {
  return {
    min: config.difficultyMin ?? 1,
    max: config.difficultyMax ?? 5,
  };
}
