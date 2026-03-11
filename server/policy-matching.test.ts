import { describe, expect, it } from "vitest";
import {
  normalizePolicyScenarioFamilies,
  scorePolicyForScenario,
  selectRelevantPolicies,
} from "./services/policy-matching";

describe("policy matching", () => {
  it("normalizes and deduplicates scenario families", () => {
    expect(
      normalizePolicyScenarioFamilies([
        "Billing Confusion",
        "billing_confusion",
        " refund-credit-request ",
      ]),
    ).toEqual(["billing_confusion", "refund_credit_request"]);
  });

  it("prefers an exact family policy over a broad department policy", () => {
    const exact = {
      title: "Billing Corrections",
      department: "customer_service",
      scenarioFamilies: ["billing_confusion"],
      content: "Explain pending versus settled charges and when billing corrections are applied.",
      version: 2,
    };
    const broad = {
      title: "Front Desk Service Recovery",
      department: "customer_service",
      scenarioFamilies: null,
      content: "Acknowledge the issue, verify the account, and give a clear next update.",
      version: 3,
    };

    const selected = selectRelevantPolicies([broad, exact], {
      department: "customer_service",
      scenarioFamily: "billing_confusion",
      situationSummary: "The member is confused about two charges and wants to know which one is still pending.",
    });

    expect(selected[0]?.title).toBe("Billing Corrections");
    expect(scorePolicyForScenario(exact, {
      department: "customer_service",
      scenarioFamily: "billing_confusion",
    })).toBeGreaterThan(scorePolicyForScenario(broad, {
      department: "customer_service",
      scenarioFamily: "billing_confusion",
    }));
  });

  it("selects emergency policies from scenario context even without an exact family list", () => {
    const emergencyControl = {
      title: "Stabilize Until Care Arrives",
      department: "mod_emergency",
      scenarioFamilies: null,
      content: "Direct staff to call 911, keep the scene controlled, and stay with the patient until EMS arrives.",
      version: 1,
    };
    const weatherPolicy = {
      title: "Range Weather Closure",
      department: "mod_emergency",
      scenarioFamilies: ["weather_range_incident"],
      content: "Suspend range activity when lightning or severe weather is present.",
      version: 1,
    };

    const selected = selectRelevantPolicies([weatherPolicy, emergencyControl], {
      department: "mod_emergency",
      situationSummary: "A member collapsed near the cardio floor and another staff member is calling 911.",
      openingLine: "She is not responding. What should we do right now?",
      requiredBehaviors: ["Take control", "Give clear directions", "Stabilize until care arrives"],
    });

    expect(selected[0]?.title).toBe("Stabilize Until Care Arrives");
  });
});
