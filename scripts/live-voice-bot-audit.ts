import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import { getScenarioGoal } from "../shared/wsc-content";

type ScenarioFixture = {
  scenario_id: string;
  department: string;
  employee_role: string;
  difficulty: number;
  scenario_family: string;
  customer_persona: {
    name: string;
    age_band: string;
    membership_context: string;
    communication_style: string;
    initial_emotion: string;
    patience_level: string;
  };
  situation_summary: string;
  opening_line: string;
  hidden_facts: string[];
  approved_resolution_paths: string[];
  required_behaviors: string[];
  critical_errors: string[];
  branch_logic: Record<string, string>;
  emotion_progression: {
    starting_state: string;
    better_if: string[];
    worse_if: string[];
  };
  completion_rules: {
    resolved_if: string[];
    end_early_if: string[];
    manager_required_if: string[];
  };
  recommended_turns: number;
};

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "audit-user",
      email: "audit@wsc.com",
      name: "Audit Employee",
      loginMethod: "supabase",
      role: "employee",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    actorUser: {
      id: 1,
      openId: "audit-user",
      email: "audit@wsc.com",
      name: "Audit Employee",
      loginMethod: "supabase",
      role: "employee",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    impersonation: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

function createScenarioFixture(overrides: Partial<ScenarioFixture> = {}): ScenarioFixture {
  return {
    scenario_id: "WSC-AUDIT-1",
    department: "customer_service",
    employee_role: "Front Desk Associate",
    difficulty: 3,
    scenario_family: "billing_confusion",
    customer_persona: {
      name: "Erin Calloway",
      age_band: "35-45",
      membership_context: "Active member with billing concern",
      communication_style: "Direct and organized",
      initial_emotion: "frustrated",
      patience_level: "moderate",
    },
    situation_summary: "A member sees charges they do not understand and wants a clear answer.",
    opening_line: "I need to know why I was charged twice and what you are going to do about it.",
    hidden_facts: ["One charge is pending and one is final."],
    approved_resolution_paths: ["Verify the ledger and explain the next step clearly."],
    required_behaviors: ["Show empathy", "Take ownership", "Give a direct next step"],
    critical_errors: ["Blame the customer", "Guess at billing policy"],
    branch_logic: {
      if_empathy_is_strong: "Customer becomes easier to help.",
      if_answer_is_vague: "Customer gets more skeptical.",
      if_policy_is_wrong: "Customer asks for a manager.",
      if_employee_takes_ownership: "Customer stays engaged.",
      if_employee_fails_to_help: "Customer escalates frustration.",
      if_employee_escalates_correctly: "Customer accepts a handoff.",
    },
    emotion_progression: {
      starting_state: "frustrated",
      better_if: ["Clear answer", "Ownership"],
      worse_if: ["Vague answer", "Deflection"],
    },
    completion_rules: {
      resolved_if: ["Customer understands the charge and next step."],
      end_early_if: ["Employee makes a critical error."],
      manager_required_if: ["Billing exception needs supervisor approval."],
    },
    recommended_turns: 4,
    ...overrides,
  };
}

type AuditCase = {
  name: string;
  scenario: ScenarioFixture;
  employeeTurns: string[];
};

async function runAuditCase(auditCase: AuditCase) {
  const caller = appRouter.createCaller(createAuthContext());
  const transcript: Array<{ role: "customer" | "employee"; message: string; emotion?: string }> = [
    {
      role: "customer",
      message: auditCase.scenario.opening_line,
      emotion: auditCase.scenario.customer_persona.initial_emotion,
    },
  ];
  const goal = getScenarioGoal(auditCase.scenario as any);

  console.log(`\n=== ${auditCase.name} ===`);
  console.log(`Goal: ${goal.title} — ${goal.description}`);
  console.log(`Customer opens: ${auditCase.scenario.opening_line}`);

  for (const [index, employeeTurn] of auditCase.employeeTurns.entries()) {
    const result = await caller.simulator.customerReply({
      scenarioJson: auditCase.scenario,
      transcript,
      employeeResponse: employeeTurn,
    });

    console.log(`\nTurn ${index + 1} employee: ${employeeTurn}`);
    console.log(`Turn ${index + 1} customer: ${result.customerReply.customer_reply}`);
    console.log(
      `State: emotion=${result.customerReply.updated_emotion} trust=${result.customerReply.trust_level} clarity=${result.customerReply.issue_clarity} complete=${result.customerReply.scenario_complete}`,
    );

    transcript.push({ role: "employee", message: employeeTurn });
    transcript.push({
      role: "customer",
      message: result.customerReply.customer_reply,
      emotion: result.customerReply.updated_emotion,
    });

    if (result.customerReply.scenario_complete) {
      break;
    }
  }
}

async function main() {
  const cases: AuditCase[] = [
    {
      name: "Bot 1 — Front Desk Billing Progression",
      scenario: createScenarioFixture({
        scenario_id: "WSC-AUDIT-BILLING",
        scenario_family: "billing_confusion",
      }),
      employeeTurns: [
        "I can see why that would be frustrating, and I am taking ownership of this.",
        "I am pulling up the ledger now to verify which charge is pending and which one is final.",
        "I will reverse the pending charge now and email the confirmation within 15 minutes.",
      ],
    },
    {
      name: "Bot 2 — Front Desk Reservation Recovery",
      scenario: createScenarioFixture({
        scenario_id: "WSC-AUDIT-RESERVATION",
        scenario_family: "reservation_issue",
        situation_summary: "A member cannot find the booking they were told was held for them.",
        opening_line: "I was told my reservation was set, and now it is missing.",
        hidden_facts: ["A duplicate note made the reservation look confirmed when it was not."],
        approved_resolution_paths: ["Check the booking notes, offer the cleanest replacement, and give a timeline."],
        required_behaviors: ["Acknowledge the miss", "Verify what happened", "Offer the next step"],
      }),
      employeeTurns: [
        "I understand why that is frustrating, and I am going to own this for you.",
        "I am checking the booking notes and reservation history right now so I can confirm what happened.",
        "I can get you into the next open slot today, and I will confirm it with you in the next five minutes.",
      ],
    },
    {
      name: "Bot 3 — Golf Discovery To Close",
      scenario: createScenarioFixture({
        scenario_id: "WSC-AUDIT-GOLF",
        department: "golf",
        employee_role: "Golf Membership Advisor",
        scenario_family: "hesitant_prospect",
        customer_persona: {
          name: "Liam Hart",
          age_band: "35-45",
          membership_context: "Prospect comparing clubs",
          communication_style: "Curious but hesitant",
          initial_emotion: "skeptical",
          patience_level: "moderate",
        },
        situation_summary: "A prospect likes the club but is unsure it fits their routine.",
        opening_line: "I like the club, but I do not know if this actually fits me.",
        hidden_facts: ["The prospect mainly needs the right fit and a confident next step."],
        approved_resolution_paths: ["Use discovery before making the value case."],
        required_behaviors: ["Open warmly", "Ask one discovery question", "Close with control"],
        critical_errors: ["Launch into a generic pitch without discovery"],
      }),
      employeeTurns: [
        "We have a great club with a lot of amenities and value.",
        "Welcome in. What are you hoping to get out of the club most right now?",
        "Based on that, I recommend the flexible range membership, and I can walk you through the next step today.",
      ],
    },
    {
      name: "Bot 4 — Emergency Response Control",
      scenario: createScenarioFixture({
        scenario_id: "WSC-AUDIT-EMERGENCY",
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "emergency_response",
        customer_persona: {
          name: "Alicia Gomez",
          age_band: "30-40",
          membership_context: "Witness to an urgent incident",
          communication_style: "Alarmed and urgent",
          initial_emotion: "alarmed",
          patience_level: "low",
        },
        situation_summary: "A witness reports that someone collapsed near the cardio area.",
        opening_line: "Someone just collapsed near cardio. We need help right now.",
        hidden_facts: ["The employee should take control and stabilize until care arrives."],
        approved_resolution_paths: ["Activate emergency response and control the scene."],
        required_behaviors: ["Take control", "Give simple directions", "Escalate immediately"],
        critical_errors: ["Delay emergency action"],
      }),
      employeeTurns: [
        "I am activating emergency response now and taking control of this.",
        "Stay with them if it is safe, keep the area clear, and wave emergency response to the cardio floor.",
        "Emergency response is on the way, and I will keep you updated until care arrives.",
      ],
    },
    {
      name: "Bot 5 — Unsafe Equipment Report",
      scenario: createScenarioFixture({
        scenario_id: "WSC-AUDIT-EQUIPMENT",
        department: "mod_emergency",
        employee_role: "Manager on Duty",
        scenario_family: "unsafe_equipment_report",
        customer_persona: {
          name: "Dana Cross",
          age_band: "45-55",
          membership_context: "Member reporting an unsafe machine",
          communication_style: "Concerned and precise",
          initial_emotion: "concerned",
          patience_level: "moderate",
        },
        situation_summary: "A member reports a cable machine that looks unsafe to use.",
        opening_line: "That cable machine looks unsafe. Someone could get hurt.",
        hidden_facts: ["The machine has not yet been tagged out."],
        approved_resolution_paths: ["Block the equipment, tag it out, and give the next update."],
        required_behaviors: ["Take ownership", "Secure the equipment", "Give the next update"],
        critical_errors: ["Leave the equipment available for use"],
      }),
      employeeTurns: [
        "I am taking ownership of this right now.",
        "I am blocking that machine from use now and tagging it out so no one else gets on it.",
        "Maintenance is being called now, and I will update you again in the next ten minutes.",
      ],
    },
  ];

  for (const auditCase of cases) {
    await runAuditCase(auditCase);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
