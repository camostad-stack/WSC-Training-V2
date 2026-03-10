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
