export const departmentLabels = {
  customer_service: "Customer Service / Front Desk",
  golf: "Golf / Sales-Service Hybrid",
  mod_emergency: "MOD / Emergency / Facilities-Adjacent",
} as const;

export type WscDepartmentKey = keyof typeof departmentLabels;

export const departmentRoles: Record<WscDepartmentKey, string> = {
  customer_service: "Front Desk Associate",
  golf: "Golf Sales-Service Associate",
  mod_emergency: "Manager on Duty",
};

export const scenarioFamiliesByDepartment: Record<WscDepartmentKey, string[]> = {
  customer_service: [
    "billing_confusion",
    "cancellation_request",
    "reservation_issue",
    "upset_parent",
    "membership_question",
    "member_complaint",
  ],
  golf: [
    "hesitant_prospect",
    "lesson_inquiry",
    "range_complaint",
    "refund_credit_request",
    "value_explanation",
  ],
  mod_emergency: [
    "slippery_entry_complaint",
    "power_interruption_confusion",
    "unsafe_equipment_report",
    "weather_range_incident",
    "emergency_response",
  ],
};

export const familyLabels: Record<string, string> = {
  billing_confusion: "Billing Confusion",
  cancellation_request: "Cancellation Request",
  reservation_issue: "Reservation Issue",
  upset_parent: "Upset Parent",
  membership_question: "Membership Question",
  member_complaint: "Member Complaint",
  hesitant_prospect: "Hesitant Prospect",
  lesson_inquiry: "Lesson Inquiry",
  range_complaint: "Range Complaint",
  refund_credit_request: "Refund / Credit Request",
  value_explanation: "Value Explanation",
  slippery_entry_complaint: "Slippery Entry Complaint",
  power_interruption_confusion: "Power Interruption Confusion",
  unsafe_equipment_report: "Unsafe Equipment Report",
  weather_range_incident: "Weather / Range Incident",
  emergency_response: "Emergency Response",
};

export const allScenarioFamilies = Object.values(scenarioFamiliesByDepartment).flat();

type ScenarioGoalInput = {
  department?: string | null;
  scenario_family?: string | null;
  issue_type?: string | null;
};

export function getScenarioGoal(input?: ScenarioGoalInput | null) {
  const family = input?.scenario_family || input?.issue_type || "";
  const department = input?.department || "";

  switch (family) {
    case "emergency_response":
      return {
        title: "Stabilize Until Care Arrives",
        description: "Take control fast, give simple directions, and keep the witness focused on the patient and the next immediate action.",
      };
    case "slippery_entry_complaint":
      return {
        title: "Secure The Hazard",
        description: "Control the area, reduce the immediate risk, and explain what is being done right now.",
      };
    case "unsafe_equipment_report":
      return {
        title: "Take The Equipment Out Of Use",
        description: "Shut the risk down first, then explain what is being secured and what happens next.",
      };
    case "power_interruption_confusion":
      return {
        title: "Give Clear Status Without Guessing",
        description: "Tell people what is confirmed, what is not, and when the next update is coming.",
      };
    case "weather_range_incident":
      return {
        title: "Hold The Safety Closure",
        description: "Stay firm on the safety call, explain the reason clearly, and give the next update path.",
      };
    case "hesitant_prospect":
    case "value_explanation":
      return {
        title: "Open Warm And Close Cleanly",
        description: "Start with warmth, learn what matters to the prospect, then recommend a fit and a clear next step.",
      };
    case "lesson_inquiry":
      return {
        title: "Clarify The Need And Land The Booking Path",
        description: "Understand what the member wants help with, then move them to the right lesson next step.",
      };
    case "range_complaint":
    case "refund_credit_request":
      return {
        title: "Solve The Practical Issue",
        description: "Acknowledge the problem, verify what is true, and land a recovery path without sounding defensive.",
      };
    case "billing_confusion":
    case "reservation_issue":
    case "member_complaint":
      return {
        title: "Own The Issue And Give The Next Update",
        description: "Show you understand the concern, verify what happened, and tell the member exactly what happens next.",
      };
    case "cancellation_request":
      return {
        title: "Clarify The Process Without Losing Control",
        description: "Acknowledge the request, explain the real cancellation path, and close with the correct next step.",
      };
    case "upset_parent":
      return {
        title: "Take Operational Ownership",
        description: "Treat the concern seriously, confirm what is happening, and hand off cleanly if supervision or safety is involved.",
      };
    case "membership_question":
      return {
        title: "Give Clear Options",
        description: "Answer the real question directly and close with the right next step if approval or paperwork is needed.",
      };
    default:
      if (department === "mod_emergency") {
        return {
          title: "Take Control Of The Situation",
          description: "Lead with safety, ownership, and the next immediate action.",
        };
      }
      if (department === "golf") {
        return {
          title: "Open Warm And Guide The Next Step",
          description: "Use discovery to understand fit, then close with control.",
        };
      }
      return {
        title: "Move The Situation Forward",
        description: "Acknowledge the real concern, take ownership, and give a clear next step.",
      };
  }
}
