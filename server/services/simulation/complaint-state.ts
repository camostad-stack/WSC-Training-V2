import type { ScenarioDirectorResult } from "../ai/contracts";
import type { ConversationOutcomeState } from "@shared/conversation-outcome";
import type {
  ComplaintRuntimeStatus,
  EmployeeUtteranceAnalysis,
  PrematureClosureTriggerSource,
  SimulationStateDraft,
  TurnProgressSummary,
} from "./types";

type ComplaintCategory =
  | "billing"
  | "cancellation"
  | "schedule_or_program"
  | "parent_safety"
  | "service_complaint"
  | "membership_info"
  | "sales_fit"
  | "emergency"
  | "general_service";

type ComplaintRequirementSet = {
  category: ComplaintCategory;
  resolutionRequirements: string[];
  nextStepRequirements: string[];
  escalationRequirements: string[];
};

type ComplaintSignals = {
  statusClarified: boolean;
  factsConfirmed: boolean;
  directResolutionSatisfied: boolean;
  pathForwardExplained: boolean;
  unresolvedSubissues: string[];
  unresolvedCustomerQuestions: string[];
  confirmedBusinessFacts: string[];
  falseCustomerAssumptions: string[];
};

type ComplaintCriterionEvidence = {
  complaintCategory: ComplaintCategory;
  statusClarified: boolean;
  factsConfirmed: boolean;
  directResolutionSatisfied: boolean;
  pathForwardExplained: boolean;
  acceptedNextStep: boolean;
  validRedirect: boolean;
  nextStepOwner: string;
  nextStepAction: string;
  nextStepTimeline: string;
  nextStepMissingFields: string[];
  complaintStillOpen: boolean;
  escalationValidity: "invalid" | "potential" | "valid";
};

export type ComplaintStateSeed = {
  complaint_category: string;
  complaint_status: ComplaintRuntimeStatus;
  complaint_still_open: boolean;
  subissues_open: string[];
  false_customer_assumptions: string[];
  confirmed_business_facts: string[];
  resolution_requirements: string[];
  next_step_requirements: string[];
  escalation_requirements: string[];
  next_step_missing_fields: string[];
  unresolved_customer_questions: string[];
};

export type ComplaintEvaluation = ComplaintStateSeed & {
  outcomeState: ConversationOutcomeState;
  rootIssueStatus: SimulationStateDraft["root_issue_status"];
  acceptedNextStep: boolean;
  nextStepOwner: string;
  nextStepAction: string;
  nextStepTimeline: string;
  validRedirect: boolean;
  escalationValidity: SimulationStateDraft["escalation_validity"];
  prematureClosureDetected: boolean;
  prematureClosureTriggerSource?: PrematureClosureTriggerSource;
  prematureClosureReason?: string;
  unmetCompletionCriteria: string[];
  unresolvedQuestions: string[];
  outcomeSummary: string;
  partiallyAddressed: boolean;
};

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function hasAnyPattern(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

const WRAP_UP_LANGUAGE_PATTERNS = [
  /\ball set\b/i,
  /\btake care of it\b/i,
  /\bhave a great day\b/i,
  /\banything else\b/i,
  /\bgood to go\b/i,
];

const VAGUE_FOLLOW_UP_PATTERNS = [
  /\bsomeone will\b/i,
  /\bwe'?ll get back to you\b/i,
  /\bfollow up\b/i,
  /\blook into it\b/i,
  /\byou should hear\b/i,
  /\bas soon as possible\b/i,
  /\bsoon\b/i,
  /\blater today\b/i,
];

function deriveComplaintCategory(scenario: ScenarioDirectorResult): ComplaintCategory {
  switch (scenario.scenario_family) {
    case "billing_confusion":
    case "refund_credit_request":
      return "billing";
    case "cancellation_request":
      return "cancellation";
    case "reservation_issue":
    case "lesson_inquiry":
    case "power_interruption_confusion":
      return "schedule_or_program";
    case "upset_parent":
      return "parent_safety";
    case "member_complaint":
    case "range_complaint":
    case "slippery_entry_complaint":
    case "unsafe_equipment_report":
    case "weather_range_incident":
      return "service_complaint";
    case "membership_question":
      return "membership_info";
    case "hesitant_prospect":
    case "value_explanation":
      return "sales_fit";
    case "emergency_response":
      return "emergency";
    default:
      if (scenario.department === "mod_emergency") return "emergency";
      return "general_service";
  }
}

function buildComplaintRequirementSet(scenario: ScenarioDirectorResult): ComplaintRequirementSet {
  const category = deriveComplaintCategory(scenario);

  switch (category) {
    case "billing":
      return {
        category,
        resolutionRequirements: [
          "The charge status is clear.",
          "The billing facts were verified or explained.",
          "The refund, correction, investigation, or escalation path is concrete.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Next step action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the billing issue.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "cancellation":
      return {
        category,
        resolutionRequirements: [
          "The current cancellation status is clear.",
          "The employee explained whether cancellation is active, pending, or needs another step.",
          "The exact cancellation action or follow-up path is concrete.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Next cancellation action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the cancellation issue.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "schedule_or_program":
      return {
        category,
        resolutionRequirements: [
          "The correct schedule or program status is clear.",
          "Any misinformation or ambiguity was corrected.",
          "The booking, recovery, or follow-up path is concrete.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Booking or follow-up action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the scheduling issue.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "parent_safety":
      return {
        category,
        resolutionRequirements: [
          "The child or parent concern was taken seriously.",
          "The facts or immediate handling path were clarified.",
          "A responsible owner or escalation path is concrete.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Handling action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the parent concern.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "service_complaint":
      return {
        category,
        resolutionRequirements: [
          "The complaint itself was addressed directly.",
          "The responsible handling path was explained.",
          "A concrete next step or escalation path exists.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Handling action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the complaint.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "membership_info":
      return {
        category,
        resolutionRequirements: [
          "The actual membership question was answered plainly.",
          "Any confusion about benefits or status was removed.",
        ],
        nextStepRequirements: [
          "If a follow-up is needed, the owner is named.",
          "If a follow-up is needed, the action is named.",
          "If a follow-up is needed, the timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the membership question.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "sales_fit":
      return {
        category,
        resolutionRequirements: [
          "The employee addressed the actual fit question or hesitation.",
          "The recommendation or guidance matched the customer need.",
        ],
        nextStepRequirements: [
          "If a follow-up is needed, the owner is named.",
          "If a follow-up is needed, the action is named.",
          "If a follow-up is needed, the timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the sales question.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    case "emergency":
      return {
        category,
        resolutionRequirements: [
          "Immediate safety direction was given.",
          "The operational response or handoff was made clear.",
        ],
        nextStepRequirements: [
          "Next owner is named.",
          "Immediate action is named.",
          "Immediate timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the emergency.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
    default:
      return {
        category,
        resolutionRequirements: [
          "The original complaint was addressed directly.",
          "The employee clarified what is true.",
          "A concrete next step or resolution path exists.",
        ],
        nextStepRequirements: [
          "Next step owner is named.",
          "Next step action is named.",
          "Next step timeline is named.",
        ],
        escalationRequirements: [
          "Escalation is appropriate for the issue.",
          "Escalation owner is named.",
          "Escalation timeline is named.",
        ],
      };
  }
}

function inferNextStepOwner(analysis: EmployeeUtteranceAnalysis, employeeMessage: string) {
  if (analysis.explicitManagerMention) return "manager";
  if (analysis.tookOwnership || analysis.explicitOwnership) return "employee";
  if (/\b(billing team|membership team|operations team|service team|coach|front desk|supervisor|team lead|lessons coordinator|lesson coordinator)\b/i.test(employeeMessage)) {
    return employeeMessage.match(/\b(billing team|membership team|operations team|service team|coach|front desk|supervisor|team lead|lessons coordinator|lesson coordinator)\b/i)?.[0].toLowerCase() || "team";
  }
  if (analysis.explicitDirection) return "customer";
  return "";
}

function inferNextStepTimeline(analysis: EmployeeUtteranceAnalysis, employeeMessage: string) {
  if (!analysis.explicitTimeline) return "";
  return employeeMessage.match(/\b(within \d+[^.?!,;]*|in \d+[^.?!,;]*|in the next \d+[^.?!,;]*|today|this afternoon|this morning|this evening|tonight|tomorrow|first thing tomorrow|before you leave|before noon|by noon|by end of day|by close|within the hour|in a few minutes|by \d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)?.[0]?.trim() || "employee provided a concrete timeline";
}

function inferNextStepAction(analysis: EmployeeUtteranceAnalysis, employeeMessage: string) {
  const match = employeeMessage.match(/\b(refund|credit|reverse|correction|correct|investigate|investigation|submit|process|confirm|email|call|document|log|flag|route|rebook|book|reserve|waitlist|hold|move|shift|fit you in|get you into|lock in|restore|rebuild|freeze|cancel|check with|handle|review|update|escalate|transfer|set up|walk you through|get (?:this|that|the next step|you) started|get (?:this|that|the next step) moving|schedule|show you|introduce you|line up|arrange|send|send over|start)\b[^.?!,;]*/i);
  if (match?.[0]) {
    return match[0].replace(/\s+/g, " ").trim();
  }
  if (analysis.explicitManagerMention) return "handoff to the manager on duty";
  if (analysis.explicitDirection) return "follow the immediate instruction that was given";
  return "";
}

function hasConcreteAction(analysis: EmployeeUtteranceAnalysis, normalizedMessage: string) {
  if (
    analysis.explicitRecommendation
    || analysis.explicitManagerMention
  ) {
    return true;
  }

  return hasAnyPattern(normalizedMessage, [
    /\brefund\b/,
    /\bcredit\b/,
    /\brevers(e|al|ed)\b/,
    /\bcorrect(ion|ed)?\b/,
    /\binvestigat(e|ion)\b/,
    /\bsubmit\b/,
    /\bprocess\b/,
    /\bconfirm\b/,
    /\bemail\b/,
    /\bcall\b/,
    /\bdocument\b/,
    /\blog\b/,
    /\bflag\b/,
    /\broute\b/,
    /\brebook\b/,
    /\bbook\b/,
    /\breserve\b/,
    /\bwaitlist\b/,
    /\bhold\b/,
    /\bmove\b/,
    /\bshift\b/,
    /\bfit you in\b/,
    /\bget you into\b/,
    /\block in\b/,
    /\brestore\b/,
    /\brebuild\b/,
    /\bfreeze\b/,
    /\bcancel\b/,
    /\bcheck with\b/,
    /\bhandle\b/,
    /\breview\b/,
    /\bset up\b/,
    /\bwalk you through\b/,
    /\bget (?:this|that|the next step|you) started\b/,
    /\bget (?:this|that|the next step) moving\b/,
    /\bschedule\b/,
    /\bshow you\b/,
    /\bintroduce you\b/,
    /\bline up\b/,
    /\barrange\b/,
    /\bsend\b/,
    /\bsend over\b/,
    /\bstart\b/,
  ]);
}

function buildNextStepMissingFields(params: {
  analysis: EmployeeUtteranceAnalysis;
  employeeMessage: string;
  nextStepOwner: string;
  nextStepAction: string;
  nextStepTimeline: string;
}) {
  const normalizedMessage = normalizeText(params.employeeMessage);
  const missing: string[] = [];
  const actionConcrete = hasConcreteAction(params.analysis, normalizedMessage);

  if (!actionConcrete || !params.nextStepAction) missing.push("action");
  if (!params.nextStepOwner) missing.push("owner");
  if (!params.nextStepTimeline) missing.push("timeline");

  return {
    actionConcrete,
    missingFields: missing,
  };
}

function hasUnresolvedConditionalPath(params: {
  category: ComplaintCategory;
  normalizedMessage: string;
}) {
  if (params.category !== "schedule_or_program") {
    return false;
  }

  return hasAnyPattern(params.normalizedMessage, [
    /\bif the slot is open\b/,
    /\bif it can be restored\b/,
    /\bif it opens up\b/,
    /\bdepending on availability\b/,
    /\buntil we know whether\b/,
    /\bonce we know whether\b/,
    /\bchecking whether\b/,
    /\bwhether it can be restored\b/,
  ]);
}

function escalationIsAppropriate(params: {
  scenario: ScenarioDirectorResult;
  category: ComplaintCategory;
  analysis: EmployeeUtteranceAnalysis;
  currentState: SimulationStateDraft;
  normalizedMessage: string;
}) {
  if (!params.analysis.explicitManagerMention) return false;
  if (params.scenario.completion_rules.manager_required_if.length > 0) return true;
  if (params.currentState.manager_request_level >= 7 || params.currentState.willingness_to_escalate >= 7) return true;
  if (hasAnyPattern(params.normalizedMessage, [/\bapproval\b/, /\bsupervisor\b/, /\bmanager\b/, /\bexception\b/])) return true;

  return ["billing", "cancellation", "parent_safety", "service_complaint", "emergency"].includes(params.category);
}

function buildConfirmedBusinessFacts(params: {
  scenario: ScenarioDirectorResult;
  discoveredFacts: string[];
  analysis: EmployeeUtteranceAnalysis;
  normalizedMessage: string;
  category: ComplaintCategory;
}) {
  const facts = [...params.discoveredFacts];
  if (params.category === "billing" && hasAnyPattern(params.normalizedMessage, [/\bpending charge\b/, /\bcharge is pending\b/, /\bfinal charge\b/, /\bduplicate charge\b/, /\bauthorization hold\b/])) {
    facts.push("The charge status was explained concretely.");
  }
  if (params.category === "cancellation" && hasAnyPattern(params.normalizedMessage, [/\bactive\b/, /\bpending\b/, /\beffective\b/, /\bnotice\b/, /\bprocessed\b/])) {
    facts.push("The cancellation status was explained concretely.");
  }
  if (params.category === "schedule_or_program" && hasAnyPattern(params.normalizedMessage, [/\bschedule\b/, /\breservation\b/, /\bbooking\b/, /\bclass\b/, /\blesson\b/, /\bprogram\b/, /\bwaitlist\b/, /\bavailable\b/])) {
    facts.push("The schedule or program status was explained concretely.");
  }
  if (params.category === "membership_info" && hasAnyPattern(params.normalizedMessage, [/\bincludes\b/, /\baccess\b/, /\byou can use\b/, /\byour plan\b/, /\byour membership\b/])) {
    facts.push("The membership access or benefit status was explained concretely.");
  }
  return dedupeStrings(facts).slice(0, 8);
}

function buildFalseCustomerAssumptions(params: {
  category: ComplaintCategory;
  normalizedMessage: string;
  confirmedBusinessFacts: string[];
}) {
  if (params.confirmedBusinessFacts.length === 0) return [];
  switch (params.category) {
    case "billing":
      if (hasAnyPattern(params.normalizedMessage, [/\bpending\b/, /\bauthorization\b/, /\bfinal\b/])) {
        return ["Both charges were final duplicate charges."];
      }
      return [];
    case "cancellation":
      if (hasAnyPattern(params.normalizedMessage, [/\bnotice\b/, /\bpending\b/, /\beffective\b/, /\bprocessed\b/])) {
        return ["The cancellation should already be fully complete with no additional step."];
      }
      return [];
    case "schedule_or_program":
      if (hasAnyPattern(params.normalizedMessage, [/\bwaitlist\b/, /\bmoved\b/, /\bcancelled\b/, /\bfull\b/, /\bavailable\b/])) {
        return ["The original schedule or booking was still correct as shown."];
      }
      return [];
    default:
      return [];
  }
}

function assessComplaintSignals(params: {
  scenario: ScenarioDirectorResult;
  category: ComplaintCategory;
  analysis: EmployeeUtteranceAnalysis;
  currentState: SimulationStateDraft;
  employeeMessage: string;
  latestCustomerMessage?: string;
  discoveredFacts: string[];
  acceptedNextStep: boolean;
  validRedirect: boolean;
  nextStepMissingFields: string[];
}): ComplaintSignals {
  const normalizedMessage = normalizeText(params.employeeMessage);
  const unresolvedSubissues: string[] = [];
  const unresolvedCustomerQuestions: string[] = [];
  const confirmedBusinessFacts = buildConfirmedBusinessFacts({
    scenario: params.scenario,
    discoveredFacts: params.discoveredFacts,
    analysis: params.analysis,
    normalizedMessage,
    category: params.category,
  });
  const falseCustomerAssumptions = buildFalseCustomerAssumptions({
    category: params.category,
    normalizedMessage,
    confirmedBusinessFacts,
  });

  let statusClarified = false;
  let factsConfirmed = false;
  let directResolutionSatisfied = false;
  let pathForwardExplained = params.acceptedNextStep || params.validRedirect;

  switch (params.category) {
    case "billing": {
      statusClarified = params.analysis.explicitExplanation
        || params.analysis.explicitVerification
        || hasAnyPattern(normalizedMessage, [/\bpending charge\b/, /\bcharge is pending\b/, /\bfinal charge\b/, /\bsecond charge\b/, /\bduplicate charge\b/, /\bbilling\b/, /\bledger\b/, /\bauthorization hold\b/, /\bcharge status\b/]);
      factsConfirmed = params.analysis.explicitVerification
        || hasAnyPattern(normalizedMessage, [/\bpending charge\b/, /\bcharge is pending\b/, /\bfinal charge\b/, /\bcharge is valid\b/, /\bcharge is invalid\b/, /\bduplicate charge\b/, /\bauthorization hold\b/])
        || confirmedBusinessFacts.length > 0;
      pathForwardExplained = pathForwardExplained
        || hasAnyPattern(normalizedMessage, [/\brefund\b/, /\bcredit\b/, /\brevers(e|al|ed)\b/, /\bcorrect(ion|ed)?\b/, /\binvestigat(e|ion)\b/, /\bconfirmation\b/]);
      directResolutionSatisfied = statusClarified
        && factsConfirmed
        && params.analysis.explicitExplanation
        && hasAnyPattern(normalizedMessage, [
          /\bnot a second final charge\b/,
          /\bpending authorization\b/,
          /\bit will drop off\b/,
          /\bno further action\b/,
          /\byou do not need to do anything else\b/,
          /\bthere is nothing additional for you to do\b/,
        ])
        && !params.analysis.explicitManagerMention;

      if (!statusClarified) {
        unresolvedSubissues.push("The customer still does not know what happened with the charge.");
        unresolvedCustomerQuestions.push("What exactly happened with the charge?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The employee still has not clarified whether the charge is valid, pending, or incorrect.");
        unresolvedCustomerQuestions.push("Is the charge valid, pending, or being corrected?");
      }
      if (!pathForwardExplained && !directResolutionSatisfied) {
        unresolvedSubissues.push("The billing correction, refund, or investigation path is still unclear.");
        unresolvedCustomerQuestions.push("What exactly are you doing about the billing issue?");
      }
      break;
    }
    case "cancellation": {
      statusClarified = params.analysis.explicitExplanation
        || params.analysis.explicitVerification
        || hasAnyPattern(normalizedMessage, [/\bcancel(lation|led|ing)?\b/, /\bactive\b/, /\bpending\b/, /\beffective\b/, /\bnotice\b/, /\bprocessed\b/]);
      factsConfirmed = statusClarified
        && (params.analysis.explicitVerification || hasAnyPattern(normalizedMessage, [/\bactive\b/, /\bpending\b/, /\beffective\b/, /\bnotice\b/, /\bprocessed\b/]));
      pathForwardExplained = pathForwardExplained
        || hasAnyPattern(normalizedMessage, [/\bform\b/, /\bpaperwork\b/, /\bsubmit\b/, /\bprocess\b/, /\bconfirm\b/, /\bstop billing\b/, /\bend date\b/]);
      directResolutionSatisfied = statusClarified
        && factsConfirmed
        && hasAnyPattern(normalizedMessage, [/\balready cancel(?:led|ed)\b/, /\beffective (today|immediately)\b/, /\bcancel(?:led|ed) as of\b/, /\byour membership is already inactive\b/]);

      if (!statusClarified) {
        unresolvedSubissues.push("The customer still does not know the current cancellation status.");
        unresolvedCustomerQuestions.push("Is the cancellation active right now or not?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The employee still has not explained whether cancellation is active, pending, or needs another step.");
        unresolvedCustomerQuestions.push("What has actually happened with the cancellation request so far?");
      }
      if (!pathForwardExplained && !directResolutionSatisfied) {
        unresolvedSubissues.push("The exact cancellation action or follow-up path is still unclear.");
        unresolvedCustomerQuestions.push("What exactly happens next with the cancellation?");
      }
      break;
    }
    case "schedule_or_program": {
      const conditionalRecoveryPath = hasUnresolvedConditionalPath({
        category: params.category,
        normalizedMessage,
      });
      statusClarified = params.analysis.explicitExplanation
        || params.analysis.explicitVerification
        || hasAnyPattern(normalizedMessage, [/\bschedule\b/, /\breservation\b/, /\bbooking\b/, /\bclass\b/, /\blesson\b/, /\bprogram\b/, /\bslot\b/, /\btime\b/]);
      factsConfirmed = params.analysis.explicitVerification
        || params.analysis.explicitRecommendation
        || hasAnyPattern(normalizedMessage, [/\bavailable\b/, /\bconfirmed\b/, /\bfull\b/, /\bwaitlist\b/, /\bcancelled\b/, /\bmoved\b/, /\bnot on\b/])
        || hasAnyPattern(normalizedMessage, [/\bbest fit\b/, /\brecommend\b/, /\bprivate lesson\b/, /\bgroup lesson\b/, /\bintro lesson\b/, /\bstarter lesson\b/])
        || confirmedBusinessFacts.length > 0;
      pathForwardExplained = pathForwardExplained
        || hasAnyPattern(normalizedMessage, [/\brebook\b/, /\bbook\b/, /\breserve\b/, /\bwaitlist\b/, /\bslot\b/, /\bcoach\b/, /\bavailable\b/, /\bhold\b/, /\bmove\b/, /\bshift\b/, /\brestore\b/, /\brebuild\b/, /\bsend\b/, /\bemail\b/, /\bcall\b/, /\bupdated confirmation\b/]);
      directResolutionSatisfied = statusClarified && factsConfirmed && pathForwardExplained && !conditionalRecoveryPath;

      if (!statusClarified) {
        unresolvedSubissues.push("The customer still does not know the correct schedule or program status.");
        unresolvedCustomerQuestions.push("What is the actual schedule or booking status?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The employee still has not corrected the ambiguity around the booking or program.");
        unresolvedCustomerQuestions.push("What was wrong with the original schedule information?");
      }
      if (!pathForwardExplained) {
        unresolvedSubissues.push("The customer still does not have a concrete booking or recovery path.");
        unresolvedCustomerQuestions.push("What exactly should I do next?");
      }
      if (conditionalRecoveryPath) {
        unresolvedSubissues.push("The recovery path still depends on availability or another unresolved check.");
        unresolvedCustomerQuestions.push("Do we actually have the slot or recovery option confirmed yet?");
      }
      break;
    }
    case "parent_safety": {
      statusClarified = params.analysis.empathy >= 5 || params.analysis.respectfulness >= 6;
      factsConfirmed = params.analysis.explicitVerification || params.analysis.explicitExplanation || params.analysis.tookOwnership;
      pathForwardExplained = pathForwardExplained || params.analysis.tookOwnership;
      directResolutionSatisfied = false;

      if (!statusClarified) {
        unresolvedSubissues.push("The parent concern still does not feel taken seriously.");
        unresolvedCustomerQuestions.push("Who is actually taking this concern seriously right now?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The facts or handling path around the child concern are still unclear.");
        unresolvedCustomerQuestions.push("What exactly happened or what is being checked right now?");
      }
      if (!pathForwardExplained) {
        unresolvedSubissues.push("There is still no concrete owner or escalation path for the parent concern.");
        unresolvedCustomerQuestions.push("Who is following up on this, and when?");
      }
      break;
    }
    case "service_complaint": {
      statusClarified = params.analysis.explicitExplanation || params.analysis.answeredQuestion || params.analysis.empathy >= 5;
      factsConfirmed = params.analysis.explicitVerification || params.analysis.tookOwnership || confirmedBusinessFacts.length > 0;
      pathForwardExplained = pathForwardExplained
        || params.analysis.tookOwnership
        || hasAnyPattern(normalizedMessage, [/\bdocument\b/, /\blog\b/, /\bflag\b/, /\broute\b/, /\bfollow up\b/, /\breach out\b/, /\bcall\b/, /\bemail\b/, /\breview\b/]);
      directResolutionSatisfied = false;

      if (!statusClarified) {
        unresolvedSubissues.push("The original complaint still has not been addressed directly.");
        unresolvedCustomerQuestions.push("Are you actually addressing the complaint I raised?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The responsible handling path is still unclear.");
        unresolvedCustomerQuestions.push("Who is actually handling this complaint?");
      }
      if (!pathForwardExplained) {
        unresolvedSubissues.push("There is still no concrete next step or escalation path for the complaint.");
        unresolvedCustomerQuestions.push("What exactly happens next with this complaint?");
      }
      break;
    }
    case "membership_info": {
      statusClarified = params.analysis.explicitExplanation || params.analysis.answeredQuestion;
      factsConfirmed = statusClarified
        && (
          params.analysis.accuracy >= 5
          || params.analysis.explicitVerification
          || confirmedBusinessFacts.length > 0
        );
      pathForwardExplained = pathForwardExplained || statusClarified;
      directResolutionSatisfied = statusClarified && factsConfirmed;

      if (!statusClarified) {
        unresolvedSubissues.push("The actual membership question still has not been answered plainly.");
        unresolvedCustomerQuestions.push("Can you answer the actual membership question directly?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The membership explanation is still too vague or uncertain.");
        unresolvedCustomerQuestions.push("What does the membership actually include or allow?");
      }
      break;
    }
    case "sales_fit": {
      statusClarified = params.analysis.explicitDiscovery || params.analysis.explicitRecommendation || params.analysis.explicitExplanation;
      factsConfirmed = statusClarified && params.analysis.clarity >= 6;
      pathForwardExplained = pathForwardExplained || params.analysis.explicitRecommendation || params.analysis.explicitNextStep;
      directResolutionSatisfied = statusClarified && factsConfirmed && (params.analysis.explicitRecommendation || params.analysis.explicitExplanation);

      if (!statusClarified) {
        unresolvedSubissues.push("The employee still has not addressed the actual fit question or hesitation.");
        unresolvedCustomerQuestions.push("How does this actually fit what I need?");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The recommendation or explanation is still too fuzzy to trust.");
        unresolvedCustomerQuestions.push("Why is that actually the right option for me?");
      }
      break;
    }
    case "emergency": {
      const updateOrHandoffClear = hasAnyPattern(normalizedMessage, [/\bon the way\b/, /\bcare arrives\b/, /\buntil care arrives\b/, /\bfully handed off\b/, /\bkeep you updated\b/, /\bhelp gets here\b/]);
      statusClarified = params.analysis.explicitSafetyControl
        || params.analysis.explicitDirection
        || params.analysis.explicitManagerMention
        || updateOrHandoffClear
        || hasAnyPattern(normalizedMessage, [/\bemergency response is on the way\b/]);
      pathForwardExplained = pathForwardExplained
        || params.analysis.explicitDirection
        || params.analysis.explicitManagerMention
        || updateOrHandoffClear;
      factsConfirmed = statusClarified && (pathForwardExplained || params.analysis.explicitVerification);
      directResolutionSatisfied = statusClarified && (params.validRedirect || updateOrHandoffClear);

      if (!statusClarified) {
        unresolvedSubissues.push("Immediate safety control still has not been established.");
        unresolvedCustomerQuestions.push("What is the immediate safety step right now?");
      }
      if (!pathForwardExplained) {
        unresolvedSubissues.push("The operational response or handoff is still unclear.");
        unresolvedCustomerQuestions.push("Who is taking over and what do we do right now?");
      }
      break;
    }
    default: {
      statusClarified = params.analysis.explicitExplanation || params.analysis.answeredQuestion;
      factsConfirmed = params.analysis.explicitVerification || params.analysis.accuracy >= 6;
      pathForwardExplained = pathForwardExplained || params.analysis.explicitNextStep;
      directResolutionSatisfied = statusClarified && factsConfirmed && pathForwardExplained;

      if (!statusClarified) {
        unresolvedSubissues.push("The original complaint still has not been addressed directly.");
      }
      if (!factsConfirmed) {
        unresolvedSubissues.push("The employee still has not clarified what is actually true.");
      }
      if (!pathForwardExplained) {
        unresolvedSubissues.push("There is still no concrete resolution path.");
      }
    }
  }

  if (params.latestCustomerMessage && !params.analysis.answeredQuestion) {
    unresolvedCustomerQuestions.unshift(params.latestCustomerMessage);
  }
  if (params.nextStepMissingFields.includes("owner")) {
    unresolvedCustomerQuestions.push("Who is actually taking the next step?");
  }
  if (params.nextStepMissingFields.includes("timeline")) {
    unresolvedCustomerQuestions.push("When should the customer expect the next update?");
  }
  if (params.nextStepMissingFields.includes("action") && !directResolutionSatisfied) {
    unresolvedCustomerQuestions.push("What is the actual next action from here?");
  }

  return {
    statusClarified,
    factsConfirmed,
    directResolutionSatisfied,
    pathForwardExplained,
    unresolvedSubissues: dedupeStrings(unresolvedSubissues).slice(0, 8),
    unresolvedCustomerQuestions: dedupeStrings(unresolvedCustomerQuestions).slice(0, 8),
    confirmedBusinessFacts,
    falseCustomerAssumptions,
  };
}

function completionCriterionSatisfied(params: {
  criterion: string;
  evidence: ComplaintCriterionEvidence;
  analysis: EmployeeUtteranceAnalysis;
  currentState: SimulationStateDraft;
}) {
  const criterion = params.criterion.trim().toLowerCase();
  const discoveredFacts = (params.currentState.discovered_facts || []).map((fact) => fact.toLowerCase());

  if (criterion.includes("customer acknowledged") && (criterion.includes("next step") || criterion.includes("escalation"))) {
    return params.evidence.acceptedNextStep || params.evidence.validRedirect || !params.evidence.complaintStillOpen;
  }
  if (criterion.includes("takes control")) {
    return params.analysis.explicitSafetyControl || discoveredFacts.some((fact) => fact.includes("immediate operational control"));
  }
  if (criterion.includes("direct instruction")) {
    return params.analysis.explicitDirection || discoveredFacts.some((fact) => fact.includes("immediate operational direction"));
  }
  if (criterion.includes("ownership") || criterion.includes("redirect")) {
    return params.analysis.tookOwnership || params.evidence.validRedirect;
  }
  if (criterion.includes("addressed directly") || criterion.includes("complaint itself")) {
    return params.evidence.statusClarified;
  }
  if (criterion.includes("next step")) {
    return params.evidence.acceptedNextStep
      || (
        params.evidence.nextStepMissingFields.length === 0
        && Boolean(params.evidence.nextStepOwner || params.evidence.nextStepAction || params.evidence.nextStepTimeline)
      );
  }
  if ((criterion.includes("recovery") && criterion.includes("path")) || criterion.includes("booking path") || criterion.includes("follow-up path")) {
    return params.evidence.acceptedNextStep || params.evidence.validRedirect || params.evidence.pathForwardExplained;
  }
  if (criterion.includes("lesson path")) {
    return params.evidence.pathForwardExplained && (params.evidence.statusClarified || params.evidence.factsConfirmed);
  }
  if (criterion.includes("care arrives") || criterion.includes("next update")) {
    return Boolean(params.evidence.nextStepTimeline) || params.evidence.directResolutionSatisfied;
  }
  if (criterion.includes("timeline") || criterion.includes("update")) {
    return Boolean(params.evidence.nextStepTimeline);
  }
  if (criterion.includes("manager") || criterion.includes("escalat") || criterion.includes("redirect")) {
    return params.evidence.validRedirect && params.evidence.escalationValidity === "valid";
  }
  if (criterion.includes("clar") || criterion.includes("explain") || criterion.includes("status")) {
    return params.evidence.statusClarified;
  }
  if (criterion.includes("policy") || criterion.includes("fact") || criterion.includes("verif")) {
    return params.evidence.factsConfirmed;
  }
  if (criterion.includes("charge") && params.evidence.complaintCategory === "billing") {
    return params.evidence.statusClarified && params.evidence.factsConfirmed;
  }
  if (criterion.includes("cancel") && params.evidence.complaintCategory === "cancellation") {
    return params.evidence.statusClarified && params.evidence.factsConfirmed;
  }
  if ((criterion.includes("schedule") || criterion.includes("program") || criterion.includes("booking") || criterion.includes("reservation") || criterion.includes("lesson") || criterion.includes("class")) && params.evidence.complaintCategory === "schedule_or_program") {
    return params.evidence.statusClarified && params.evidence.factsConfirmed;
  }
  if (criterion.includes("resolve")) {
    return !params.evidence.complaintStillOpen;
  }

  return !params.evidence.complaintStillOpen;
}

function buildOutcomeSummary(params: {
  outcomeState: ConversationOutcomeState;
  category: ComplaintCategory;
  complaintStillOpen: boolean;
  unresolvedSubissues: string[];
  nextStepMissingFields: string[];
  acceptedNextStep: boolean;
  validRedirect: boolean;
  prematureClosureDetected: boolean;
}) {
  if (params.outcomeState === "RESOLVED") {
    return "The original complaint is no longer materially open.";
  }
  if (params.outcomeState === "ESCALATED") {
    return "The complaint moved into a concrete, accepted escalation path with a named owner and timeline.";
  }
  if (params.outcomeState === "ABANDONED") {
    return "The complaint stayed open and the conversation broke down before a workable path forward was accepted.";
  }

  const reasons: string[] = [];
  if (params.prematureClosureDetected) reasons.push("the employee tried to close before the complaint was actually settled");
  if (params.complaintStillOpen) reasons.push("the original complaint is still materially open");
  if (!params.acceptedNextStep && !params.validRedirect) reasons.push("there is no concrete accepted path forward yet");
  if (params.nextStepMissingFields.length > 0) reasons.push(`the next step is missing ${params.nextStepMissingFields.join(", ")}`);
  if (params.unresolvedSubissues.length > 0) reasons.push(`still open: ${params.unresolvedSubissues.slice(0, 2).join(", ")}`);
  return reasons.join("; ") || `The ${params.category.replace(/_/g, " ")} complaint is still active.`;
}

function detectPrematureClosure(params: {
  analysis: EmployeeUtteranceAnalysis;
  normalizedMessage: string;
  complaintStillOpen: boolean;
  nextStepMissingFields: string[];
  unresolvedSubissues: string[];
  validRedirect: boolean;
  acceptedNextStep: boolean;
}) {
  const unresolved = params.complaintStillOpen
    || params.nextStepMissingFields.length > 0
    || params.unresolvedSubissues.length > 0
    || (!params.acceptedNextStep && !params.validRedirect);

  if (!unresolved) {
    return {
      detected: false,
      triggerSource: undefined as PrematureClosureTriggerSource | undefined,
      reason: undefined as string | undefined,
    };
  }

  if (params.analysis.explicitClosureAttempt) {
    return {
      detected: true,
      triggerSource: "employee_wrap_up_language" as const,
      reason: params.normalizedMessage.trim(),
    };
  }

  if (params.analysis.explicitManagerMention && params.nextStepMissingFields.length > 0) {
    return {
      detected: true,
      triggerSource: "employee_transcript" as const,
      reason: "Redirect or escalation was mentioned without a clear owner, action, and timeline.",
    };
  }

  if (
    params.analysis.vaguenessDetected
    && hasAnyPattern(params.normalizedMessage, VAGUE_FOLLOW_UP_PATTERNS)
    && params.nextStepMissingFields.length > 0
  ) {
    return {
      detected: true,
      triggerSource: "employee_transcript" as const,
      reason: "Vague follow-up promise without a concrete owner or timeline.",
    };
  }

  if (
    hasAnyPattern(params.normalizedMessage, WRAP_UP_LANGUAGE_PATTERNS)
    && (params.analysis.nextStepQuality <= 5 || params.analysis.explanationQuality <= 5 || params.analysis.helpfulness <= 5)
  ) {
    return {
      detected: true,
      triggerSource: "employee_wrap_up_language" as const,
      reason: "Wrap-up language was used before the complaint was actually settled.",
    };
  }

  return {
    detected: false,
    triggerSource: undefined as PrematureClosureTriggerSource | undefined,
    reason: undefined as string | undefined,
  };
}

export function buildInitialComplaintState(scenario: ScenarioDirectorResult): ComplaintStateSeed {
  const requirements = buildComplaintRequirementSet(scenario);
  return {
    complaint_category: requirements.category,
    complaint_status: "OPEN",
    complaint_still_open: true,
    subissues_open: requirements.resolutionRequirements.slice(),
    false_customer_assumptions: [],
    confirmed_business_facts: [],
    resolution_requirements: requirements.resolutionRequirements,
    next_step_requirements: requirements.nextStepRequirements,
    escalation_requirements: requirements.escalationRequirements,
    next_step_missing_fields: ["owner", "action", "timeline"],
    unresolved_customer_questions: [],
  };
}

export function evaluateComplaintOutcome(params: {
  scenario: ScenarioDirectorResult;
  currentState: SimulationStateDraft;
  analysis: EmployeeUtteranceAnalysis;
  progress: TurnProgressSummary;
  latestCustomerMessage?: string;
  employeeMessage: string;
  discoveredFacts: string[];
}): ComplaintEvaluation {
  const requirements = buildComplaintRequirementSet(params.scenario);
  const normalizedMessage = normalizeText(params.employeeMessage);
  const nextStepOwner = inferNextStepOwner(params.analysis, params.employeeMessage);
  const nextStepAction = inferNextStepAction(params.analysis, params.employeeMessage);
  const nextStepTimeline = inferNextStepTimeline(params.analysis, params.employeeMessage);
  const nextStepSnapshot = buildNextStepMissingFields({
    analysis: params.analysis,
    employeeMessage: params.employeeMessage,
    nextStepOwner,
    nextStepAction,
    nextStepTimeline,
  });
  const hasNamedOperationalOwner = Boolean(nextStepOwner) && nextStepOwner !== "customer";
  const unresolvedConditionalPath = hasUnresolvedConditionalPath({
    category: requirements.category,
    normalizedMessage,
  });
  const acceptedNextStep = nextStepSnapshot.missingFields.length === 0
    && (
      params.analysis.tookOwnership
      || params.analysis.explicitManagerMention
      || hasNamedOperationalOwner
      || (requirements.category === "emergency" && params.analysis.explicitDirection)
    )
    && !unresolvedConditionalPath
    && params.analysis.helpfulness >= (requirements.category === "emergency" ? 5 : 6)
    && params.analysis.clarity >= (requirements.category === "emergency" ? 5 : 6)
    && !params.analysis.avoidedQuestion
    && !params.analysis.deadEndLanguage
    && !params.analysis.disrespect;
  const escalationAppropriate = escalationIsAppropriate({
    scenario: params.scenario,
    category: requirements.category,
    analysis: params.analysis,
    currentState: params.currentState,
    normalizedMessage,
  });
  const validRedirect = params.analysis.explicitManagerMention
    && escalationAppropriate
    && nextStepSnapshot.missingFields.length === 0
    && !params.analysis.soundedDismissive
    && !params.analysis.soundedRude
    && (params.analysis.tookOwnership || params.analysis.setExpectationsClearly || params.analysis.explicitTimeline);
  const escalationValidity = validRedirect ? "valid" : params.analysis.explicitManagerMention ? (escalationAppropriate ? "potential" : "invalid") : "invalid";

  const complaintSignals = assessComplaintSignals({
    scenario: params.scenario,
    category: requirements.category,
    analysis: params.analysis,
    currentState: params.currentState,
    employeeMessage: params.employeeMessage,
    latestCustomerMessage: params.latestCustomerMessage,
    discoveredFacts: params.discoveredFacts,
    acceptedNextStep,
    validRedirect,
    nextStepMissingFields: nextStepSnapshot.missingFields,
  });

  const directResolutionAvailable = complaintSignals.directResolutionSatisfied;
  const concretePathForward = acceptedNextStep || validRedirect;
  const partiallyAddressed =
    complaintSignals.statusClarified
    || complaintSignals.factsConfirmed
    || complaintSignals.pathForwardExplained
    || directResolutionAvailable
    || concretePathForward;
  const unmetResolutionRequirements = requirements.resolutionRequirements.filter((requirement, index) => {
    if (index === 0) return !complaintSignals.statusClarified;
    if (index === 1) return !complaintSignals.factsConfirmed;
    return !complaintSignals.directResolutionSatisfied && !concretePathForward;
  });
  const complaintStillOpen = unmetResolutionRequirements.length > 0;
  const prematureClosure = detectPrematureClosure({
    analysis: params.analysis,
    normalizedMessage,
    complaintStillOpen,
    nextStepMissingFields: nextStepSnapshot.missingFields,
    unresolvedSubissues: complaintSignals.unresolvedSubissues,
    validRedirect,
    acceptedNextStep,
  });
  const prematureClosureDetected = prematureClosure.detected;

  const evidence: ComplaintCriterionEvidence = {
    complaintCategory: requirements.category,
    statusClarified: complaintSignals.statusClarified,
    factsConfirmed: complaintSignals.factsConfirmed,
    directResolutionSatisfied: complaintSignals.directResolutionSatisfied,
    pathForwardExplained: complaintSignals.pathForwardExplained,
    acceptedNextStep,
    validRedirect,
    nextStepOwner,
    nextStepAction,
    nextStepTimeline,
    nextStepMissingFields: nextStepSnapshot.missingFields,
    complaintStillOpen,
    escalationValidity,
  };

  const explicitCriteria = (params.scenario.completion_criteria || []).filter(Boolean);
  const unmetScenarioCriteria = explicitCriteria.filter((criterion) => !completionCriterionSatisfied({
    criterion,
    evidence,
    analysis: params.analysis,
    currentState: params.currentState,
  }));

  const unmetComplaintCriteria = [
    ...unmetResolutionRequirements,
    ...(directResolutionAvailable || acceptedNextStep || validRedirect ? [] : nextStepSnapshot.missingFields.length === 3 ? [] : nextStepSnapshot.missingFields.map((field) => `Next step is missing ${field}.`)),
    ...unmetScenarioCriteria,
  ];

  let outcomeState: ConversationOutcomeState = "ACTIVE";
  if (validRedirect && escalationValidity === "valid") {
    outcomeState = "ESCALATED";
  } else if (!complaintStillOpen && unmetComplaintCriteria.length === 0) {
    outcomeState = "RESOLVED";
  } else if (
    params.currentState.likely_next_behavior === "disengage"
    && complaintStillOpen
    && !acceptedNextStep
    && !validRedirect
    && (
      (params.currentState.offense_level >= 8 && params.currentState.trust_level <= 2)
      || params.analysis.soundedRude
      || params.analysis.blameShifting
    )
  ) {
    outcomeState = "ABANDONED";
  } else if (partiallyAddressed) {
    outcomeState = "PARTIALLY_RESOLVED";
  }

  let complaintStatus: ComplaintRuntimeStatus = "OPEN";
  let rootIssueStatus: SimulationStateDraft["root_issue_status"] = "UNRESOLVED";
  if (outcomeState === "ABANDONED") {
    complaintStatus = "ABANDONED";
    rootIssueStatus = "ABANDONED";
  } else if (outcomeState === "ESCALATED") {
    complaintStatus = "ESCALATED";
    rootIssueStatus = "REDIRECT_PENDING";
  } else if (outcomeState === "RESOLVED") {
    complaintStatus = "RESOLVED";
    rootIssueStatus = "RESOLVED";
  } else if (partiallyAddressed) {
    complaintStatus = acceptedNextStep || validRedirect ? "REDIRECT_PENDING" : "PARTIALLY_ADDRESSED";
    rootIssueStatus = acceptedNextStep || validRedirect ? "REDIRECT_PENDING" : "PARTIALLY_ADDRESSED";
  }

  const unresolvedCustomerQuestions = complaintSignals.unresolvedCustomerQuestions;
  const unresolvedSubissues = dedupeStrings([
    ...complaintSignals.unresolvedSubissues,
    ...unmetComplaintCriteria,
  ]);
  const complaintOpen = outcomeState === "ACTIVE" || outcomeState === "PARTIALLY_RESOLVED";

  return {
    complaint_category: requirements.category,
    complaint_status: complaintStatus,
    complaint_still_open: complaintOpen,
    subissues_open: unresolvedSubissues,
    false_customer_assumptions: complaintSignals.falseCustomerAssumptions,
    confirmed_business_facts: complaintSignals.confirmedBusinessFacts,
    resolution_requirements: requirements.resolutionRequirements,
    next_step_requirements: requirements.nextStepRequirements,
    escalation_requirements: requirements.escalationRequirements,
    acceptedNextStep,
    nextStepOwner: acceptedNextStep || validRedirect ? nextStepOwner : "",
    nextStepAction: acceptedNextStep || validRedirect ? nextStepAction : "",
    nextStepTimeline: acceptedNextStep || validRedirect ? nextStepTimeline : "",
    next_step_missing_fields: (
      directResolutionAvailable
      && !acceptedNextStep
      && !validRedirect
      && !params.analysis.explicitNextStep
      && !params.analysis.explicitTimeline
      && !params.analysis.explicitManagerMention
    ) ? [] : nextStepSnapshot.missingFields,
    validRedirect,
    escalationValidity,
    prematureClosureDetected,
    prematureClosureTriggerSource: prematureClosure.triggerSource,
    prematureClosureReason: prematureClosure.reason,
    unmetCompletionCriteria: dedupeStrings(unmetComplaintCriteria),
    unresolved_customer_questions: unresolvedCustomerQuestions,
    unresolvedQuestions: dedupeStrings([
      ...unresolvedCustomerQuestions,
      ...(params.latestCustomerMessage && !params.analysis.answeredQuestion ? [params.latestCustomerMessage] : []),
    ]).slice(0, 8),
    outcomeState,
    rootIssueStatus,
    outcomeSummary: buildOutcomeSummary({
      outcomeState,
      category: requirements.category,
      complaintStillOpen: complaintOpen,
      unresolvedSubissues,
      nextStepMissingFields: directResolutionAvailable && !acceptedNextStep && !validRedirect ? [] : nextStepSnapshot.missingFields,
      acceptedNextStep,
      validRedirect,
      prematureClosureDetected,
    }),
    partiallyAddressed,
  };
}
