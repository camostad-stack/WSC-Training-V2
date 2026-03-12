import { describe, expect, it } from "vitest";
import { ingestPolicyDocument } from "./services/policy-ingestion";

describe("policy ingestion", () => {
  it("splits a long document into usable sections and tags customer service families", () => {
    const policies = ingestPolicyDocument({
      sourceTitle: "Front Desk Handbook",
      content: `
Billing Questions
When a member asks about duplicate billing, staff must verify whether one charge is pending and one has settled. Do not guess. Explain the status clearly and tell the member what update they will receive next.

Cancellation Requests
If a member wants to cancel, explain the cancellation window, confirm any written notice requirement, and route exceptions to the manager on duty. Do not promise an exception without approval.
      `,
    });

    expect(policies.length).toBeGreaterThanOrEqual(2);
    expect(policies[0]?.scenarioFamilies).toContain("billing_confusion");
    expect(policies[1]?.scenarioFamilies).toContain("cancellation_request");
    expect(policies[0]?.department).toBe("customer_service");
  });

  it("detects emergency content and maps it to emergency scenarios", () => {
    const policies = ingestPolicyDocument({
      sourceTitle: "Emergency SOP",
      content: `
Medical Emergency
If a member is unresponsive, call 911 immediately, assign one staff member to meet EMS, and stabilize until care arrives. Keep the area controlled and give short, direct updates to the witness.
      `,
    });

    expect(policies).toHaveLength(1);
    expect(policies[0]?.department).toBe("mod_emergency");
    expect(policies[0]?.scenarioFamilies).toContain("emergency_response");
  });
});
