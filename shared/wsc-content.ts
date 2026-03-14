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

type ScenarioCriteriaInput = {
  approvedResolutionPaths?: string[] | null;
  requiredBehaviors?: string[] | null;
  completionRules?: {
    resolved_if?: string[] | null;
    end_early_if?: string[] | null;
    manager_required_if?: string[] | null;
  } | null;
  completionCriteria?: string[] | null;
  failureCriteria?: string[] | null;
};

export type ScenarioHumanContext = {
  motive: string;
  hidden_context: string;
  personality_style: string;
  past_history: string;
  pressure_context: string;
  friction_points: string[];
  emotional_triggers: string[];
  likely_assumptions: string[];
  what_hearing_them_out_sounds_like: string[];
  credible_next_steps: string[];
  calm_down_if: string[];
  lose_trust_if: string[];
};

function dedupeCriteria(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );
}

export function deriveCompletionCriteria(input?: ScenarioCriteriaInput | null) {
  const explicit = input?.completionCriteria ?? [];
  const resolved = input?.completionRules?.resolved_if ?? [];
  const paths = input?.approvedResolutionPaths ?? [];
  const behaviors = input?.requiredBehaviors ?? [];

  if (explicit.length > 0 || resolved.length > 0) {
    return dedupeCriteria([
      ...explicit,
      ...resolved,
    ]).slice(0, 6);
  }

  return dedupeCriteria([
    ...paths.slice(0, 2),
    ...behaviors.slice(0, 1),
  ]).slice(0, 6);
}

export function deriveFailureCriteria(input?: ScenarioCriteriaInput | null) {
  const explicit = input?.failureCriteria ?? [];
  const endedEarly = input?.completionRules?.end_early_if ?? [];
  const managerRequired = input?.completionRules?.manager_required_if ?? [];

  return dedupeCriteria([
    ...explicit,
    ...endedEarly,
    managerRequired.length > 0 ? "unclear handoff or escalation path" : null,
    "customer still confused at end",
    "no clear next step",
  ]).slice(0, 6);
}

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

export function deriveScenarioHumanContext(input?: ScenarioGoalInput | null): ScenarioHumanContext {
  const family = input?.scenario_family || input?.issue_type || "";
  const department = input?.department || "";

  switch (family) {
    case "billing_confusion":
      return {
        motive: "Find out why there are multiple charges and leave knowing exactly what is being fixed.",
        hidden_context: "They already spent time trying to get a callback and do not want another vague promise.",
        personality_style: "Direct, organized, and detail-sensitive when money is involved.",
        past_history: "They have dealt with at least one prior billing hiccup and are listening for signs that this is being brushed off again.",
        pressure_context: "They are not in physical danger, but they do feel financial pressure and want clarity now.",
        friction_points: ["Vague billing explanations", "No owner", "No timeline", "Being told to wait without specifics"],
        emotional_triggers: ["Hearing policy before the actual explanation", "Guessing about charges", "Acting like duplicate charges are normal"],
        likely_assumptions: ["The club made an avoidable mistake", "Someone should already know what happened", "Another callback promise may not happen"],
        what_hearing_them_out_sounds_like: ["Naming the exact charge issue", "Explaining what is pending vs final in plain language", "Owning the follow-up failure if one happened"],
        credible_next_steps: ["A specific account check", "A named correction step", "A timeline for confirmation or refund update"],
        calm_down_if: ["The employee explains the charges clearly", "A real owner and timeline are given", "The employee sounds specific instead of scripted"],
        lose_trust_if: ["The employee talks around the issue", "The employee sounds confidently vague", "The employee pushes the member elsewhere too quickly"],
      };
    case "cancellation_request":
      return {
        motive: "Understand the real cancellation process and avoid being trapped in vague policy talk.",
        hidden_context: "They may already expect resistance and are listening for whether the employee is helping or hiding behind process.",
        personality_style: "Controlled but skeptical; willing to push if the answer feels slippery.",
        past_history: "They may have heard a different version of the policy from someone else or online.",
        pressure_context: "They want closure on the account and do not want loose ends or surprise charges.",
        friction_points: ["Policy without practical help", "No concrete next step", "Vague wording about paperwork", "No owner or confirmation path"],
        emotional_triggers: ["Sounding defensive about policy", "Talking like cancellation is the customer's fault", "Closing before the process is clear"],
        likely_assumptions: ["The club is trying to make cancellation harder than it needs to be", "Different employees may say different things"],
        what_hearing_them_out_sounds_like: ["Acknowledging the request directly", "Explaining the real process plainly", "Giving the exact next step with timeline or owner"],
        credible_next_steps: ["Specific paperwork or notice step", "Named owner for follow-up", "Clear explanation of when the cancellation is effective"],
        calm_down_if: ["The process is explained without spin", "The employee owns what happens next", "The next contact point is concrete"],
        lose_trust_if: ["The employee uses policy as a shield", "The employee avoids stating when the membership changes", "The employee closes with 'just wait'"],
      };
    case "reservation_issue":
      return {
        motive: "Find out what happened to the reservation and whether the club can actually fix it.",
        hidden_context: "They may already have rearranged their schedule and now feel inconvenienced or embarrassed.",
        personality_style: "Time-sensitive and increasingly sharp if they feel the employee is wasting time.",
        past_history: "They expect a front desk team to know what happened or at least take control quickly.",
        pressure_context: "Their schedule is already affected, so delay feels more personal than abstract.",
        friction_points: ["Blaming another department", "Acting like the miss is minor", "No alternative or recovery path"],
        emotional_triggers: ["Repeating the same question", "No ownership", "No practical alternative"],
        likely_assumptions: ["Someone at the club dropped the ball", "The employee may try to pass the problem off"],
        what_hearing_them_out_sounds_like: ["Restating the reservation issue accurately", "Acknowledging the impact on their plans", "Moving quickly to recovery options"],
        credible_next_steps: ["Concrete alternative", "Named follow-up", "Immediate check with the responsible team"],
        calm_down_if: ["The employee moves quickly", "A clear alternative is offered", "The employee owns the fix instead of defending the miss"],
        lose_trust_if: ["The employee blames another desk or coach", "The employee sounds casual about the inconvenience", "The employee offers no workable path forward"],
      };
    case "upset_parent":
      return {
        motive: "Make sure their child was handled appropriately and that someone responsible is taking it seriously.",
        hidden_context: "The parent is listening for seriousness, not polished empathy.",
        personality_style: "Protective, emotionally loaded, and very sensitive to anything that sounds dismissive.",
        past_history: "They may already be thinking about whether the club can be trusted with their child.",
        pressure_context: "This feels personal and safety-adjacent, so tone matters immediately.",
        friction_points: ["Minimizing the concern", "Policy talk before facts", "No manager involvement when clearly needed"],
        emotional_triggers: ["Sounding defensive about staff", "Explaining before listening", "Acting like the parent is overreacting"],
        likely_assumptions: ["Something was mishandled", "The club may try to protect staff before protecting the child"],
        what_hearing_them_out_sounds_like: ["Taking the concern seriously right away", "Gathering facts without minimizing", "Explaining who is taking over if needed"],
        credible_next_steps: ["Manager handoff", "Immediate fact check", "Clear follow-up owner and update timing"],
        calm_down_if: ["The employee sounds serious and present", "The concern is treated as legitimate", "There is a visible ownership path"],
        lose_trust_if: ["The employee minimizes the impact", "The employee sounds scripted", "The employee avoids escalation when supervision or safety is involved"],
      };
    case "membership_question":
      return {
        motive: "Get a plain answer about what their membership includes and what the next option is.",
        hidden_context: "They may be embarrassed to ask and do not want a fuzzy or salesy answer.",
        personality_style: "Reasonable but impatient with muddy explanations.",
        past_history: "They may have heard inconsistent explanations before.",
        pressure_context: "Low urgency, but low tolerance for rambling.",
        friction_points: ["Jargon", "Over-explaining", "Talking around the actual benefit question"],
        emotional_triggers: ["Salesy language", "No direct answer", "Contradicting what another employee said"],
        likely_assumptions: ["The answer should be straightforward if the employee knows the membership"],
        what_hearing_them_out_sounds_like: ["Answering the exact benefit question", "Using plain language", "Explaining the next approval or paperwork step if needed"],
        credible_next_steps: ["Direct benefit answer", "Specific upgrade/downgrade path", "Clear next action if a change is needed"],
        calm_down_if: ["The employee is simple and direct", "The employee answers first, then expands if needed"],
        lose_trust_if: ["The employee sounds unsure but acts sure", "The employee turns it into a vague sales speech", "The employee avoids the actual benefit question"],
      };
    case "member_complaint":
      return {
        motive: "Be taken seriously and leave knowing someone will actually handle the complaint.",
        hidden_context: "They may not need immediate perfection, but they do need to believe the complaint will not disappear.",
        personality_style: "Frustrated but still willing to work with someone competent.",
        past_history: "This may be one of several small frustrations, so the patience is already thinning.",
        pressure_context: "Moderate; the emotional weight comes more from repeated annoyance than emergency.",
        friction_points: ["Arguing with the complaint", "Treating it like no big deal", "No follow-up path"],
        emotional_triggers: ["Defensiveness", "No ownership", "Making them repeat the story unnecessarily"],
        likely_assumptions: ["The club may log the complaint and do nothing", "Employees may try to explain it away"],
        what_hearing_them_out_sounds_like: ["Reflecting the actual complaint", "Not debating validity", "Explaining who owns the follow-up"],
        credible_next_steps: ["Complaint logged with follow-up owner", "Manager review", "Specific update timing"],
        calm_down_if: ["The employee is respectful and concrete", "There is a real follow-up owner", "The customer does not have to fight to be believed"],
        lose_trust_if: ["The employee debates the complaint", "There is no owner or update path", "The employee sounds like they just want it to go away"],
      };
    case "hesitant_prospect":
    case "value_explanation":
      return {
        motive: "Figure out whether the club is actually worth it without being pushed into a canned sales pitch.",
        hidden_context: "They may be comparing other clubs and quietly testing whether the employee listens or just pitches.",
        personality_style: "Skeptical, comparison-oriented, and sensitive to pressure.",
        past_history: "They have likely heard polished membership pitches elsewhere and do not want another one.",
        pressure_context: "Low urgency, but trust is fragile and can drop fast if they feel handled.",
        friction_points: ["Pitching too early", "Generic value language", "No discovery", "Pushy close"],
        emotional_triggers: ["Being sold at", "Feeling steered before being understood", "Hearing stock membership language"],
        likely_assumptions: ["The employee might push the most expensive option", "They may not listen before recommending"],
        what_hearing_them_out_sounds_like: ["Asking what matters first", "Connecting the recommendation to what they said", "Explaining value in practical terms"],
        credible_next_steps: ["A recommendation tied to their stated goals", "A clear booking or tour path", "Concrete next contact step"],
        calm_down_if: ["The employee asks good discovery questions", "The recommendation feels tailored", "The close is clear without being pushy"],
        lose_trust_if: ["The employee pitches too early", "The employee sounds generic", "The recommendation does not match what they said"],
      };
    case "lesson_inquiry":
      return {
        motive: "Find the right lesson path without being bounced around or oversold.",
        hidden_context: "They may be new and uncertain, so clarity matters more than enthusiasm.",
        personality_style: "Curious but cautious; open if the employee feels competent.",
        past_history: "Limited prior knowledge, so they rely heavily on the employee to guide cleanly.",
        pressure_context: "Low to moderate urgency; confusion is the bigger risk than anger.",
        friction_points: ["Too much jargon", "No booking path", "Over-selling before clarifying need"],
        emotional_triggers: ["Complicated explanation", "No clear coach/format next step", "Generic recommendation"],
        likely_assumptions: ["The employee should be able to tell them what the next step actually is"],
        what_hearing_them_out_sounds_like: ["Clarifying what they want help with", "Explaining lesson formats plainly", "Giving the booking path clearly"],
        credible_next_steps: ["Coach availability check", "Lesson format recommendation", "Concrete booking instruction"],
        calm_down_if: ["The employee explains simply", "The recommendation fits what they asked for", "The booking path is clear"],
        lose_trust_if: ["The employee sounds uncertain", "The employee gives no booking path", "The employee talks in circles"],
      };
    case "range_complaint":
    case "refund_credit_request":
      return {
        motive: "Get the practical issue fixed without having to fight for basic fairness.",
        hidden_context: "They are usually willing to work with staff, but they need to hear what is actually being done.",
        personality_style: "Direct, somewhat skeptical, and quick to test whether the employee is really helping.",
        past_history: "They may already feel like they should not have had to ask twice.",
        pressure_context: "Moderate; this is about fairness and follow-through.",
        friction_points: ["Defensive explanations", "No real recovery path", "Policy without practical help"],
        emotional_triggers: ["Blame shifting", "No ownership", "A vague 'we'll look at it' close"],
        likely_assumptions: ["The club may try to defend the charge or complaint instead of solving it"],
        what_hearing_them_out_sounds_like: ["Acknowledging the practical issue", "Verifying the relevant facts", "Explaining the recovery path clearly"],
        credible_next_steps: ["Specific refund/credit check", "Named owner", "Update timeline"],
        calm_down_if: ["The employee stops being defensive", "The employee gives a real recovery path", "The employee sounds concrete"],
        lose_trust_if: ["The employee hides behind policy", "The employee offers no real action", "The employee sounds dismissive of the fairness issue"],
      };
    case "slippery_entry_complaint":
      return {
        motive: "Make sure the hazard is controlled and that someone competent is actually taking charge.",
        hidden_context: "They may be half complaint, half witness to a real safety issue.",
        personality_style: "Concerned, practical, and sensitive to slow action.",
        past_history: "Not much patience for delay when someone could get hurt.",
        pressure_context: "Urgent enough that clear direction matters more than explanation.",
        friction_points: ["Talking before controlling the hazard", "No direction", "No ownership"],
        emotional_triggers: ["Slow response", "Casual tone", "Policy recital instead of action"],
        likely_assumptions: ["The club should already be moving on this", "A capable employee would take control fast"],
        what_hearing_them_out_sounds_like: ["Recognizing the immediate safety concern", "Giving clear direction", "Explaining who is addressing the hazard"],
        credible_next_steps: ["Area secured now", "Maintenance or MOD dispatched", "Clear next update path"],
        calm_down_if: ["The employee takes control fast", "The hazard is clearly being secured", "Updates sound credible"],
        lose_trust_if: ["The employee sounds unsure", "The employee delays action", "The employee gives no clear direction"],
      };
    case "power_interruption_confusion":
      return {
        motive: "Understand what is actually happening and what the next update will be.",
        hidden_context: "They can tolerate uncertainty if it sounds honest, but not if it sounds guessed.",
        personality_style: "Anxious but reasonable when the information is clean.",
        past_history: "Likely no strong history, but patience drops if updates feel improvised.",
        pressure_context: "Moderate operational pressure; people want status and next update timing.",
        friction_points: ["Guessing", "Contradictory information", "No timeline for next update"],
        emotional_triggers: ["Confident sounding guesses", "Vagueness", "Inconsistent status updates"],
        likely_assumptions: ["The employee may not know, but should at least know who does"],
        what_hearing_them_out_sounds_like: ["Saying what is confirmed vs unconfirmed", "Giving the next update path", "Owning communication clearly"],
        credible_next_steps: ["Specific update timing", "Named owner for the next update", "Clear status of facilities or services"],
        calm_down_if: ["The employee is honest about what is known", "There is a timeline for the next update", "The status is communicated cleanly"],
        lose_trust_if: ["The employee guesses", "The employee contradicts earlier info", "The employee sounds sure without facts"],
      };
    case "unsafe_equipment_report":
      return {
        motive: "Make sure the equipment is taken out of use and that someone responsible is addressing the risk.",
        hidden_context: "They do not care about polished language; they care whether the risk is stopped.",
        personality_style: "Alert, practical, and increasingly blunt if action is slow.",
        past_history: "No appetite for soft handling when equipment safety is involved.",
        pressure_context: "High enough that they want action before explanation.",
        friction_points: ["No immediate tag-out or closure", "Explaining before acting", "No ownership"],
        emotional_triggers: ["Minimizing the report", "Leaving the equipment accessible", "No clear handoff"],
        likely_assumptions: ["Someone could still use the equipment if the employee is slow"],
        what_hearing_them_out_sounds_like: ["Taking the report seriously immediately", "Taking the equipment out of use", "Explaining who is handling the fix"],
        credible_next_steps: ["Equipment blocked now", "Maintenance or MOD notified", "Clear next update path"],
        calm_down_if: ["The equipment is clearly secured", "The employee sounds in control", "The handoff is concrete"],
        lose_trust_if: ["The employee hesitates", "The employee acts casual", "The employee offers no immediate control step"],
      };
    case "weather_range_incident":
    case "emergency_response":
      return {
        motive: "Know that someone competent is in control and that the next immediate action is happening now.",
        hidden_context: "They are running on stress; clarity and control matter more than friendliness.",
        personality_style: "Urgent, emotionally loaded, and highly sensitive to uncertainty.",
        past_history: "Not much tolerance for delay or polished language in an emergency moment.",
        pressure_context: "High urgency; the conversation should stay anchored in immediate action, scene control, and updates.",
        friction_points: ["No direction", "No owner", "No next action", "Policy talk before control"],
        emotional_triggers: ["Hesitation", "Sounding unsure", "Premature wrap-up language", "Lack of updates"],
        likely_assumptions: ["The employee should be taking control already", "A calm voice without action is not enough"],
        what_hearing_them_out_sounds_like: ["Immediate control language", "Simple directions", "Clear statement of who is doing what next"],
        credible_next_steps: ["Emergency response activated", "Area secured", "Specific update until care arrives"],
        calm_down_if: ["The employee takes control immediately", "Directions are clear", "The next update path is specific"],
        lose_trust_if: ["The employee hesitates", "The employee over-explains", "The employee sounds procedural instead of active"],
      };
    default:
      if (department === "golf") {
        return {
          motive: "Figure out whether the club fits without being pushed through a script.",
          hidden_context: "They are listening for whether the employee actually hears them.",
          personality_style: "Curious but skeptical of polished sales language.",
          past_history: "Likely comparing options and not fully committed yet.",
          pressure_context: "Low urgency but low patience for generic value talk.",
          friction_points: ["No discovery", "Pushy pitch", "Generic benefits language"],
          emotional_triggers: ["Being sold at", "Not feeling understood", "No concrete next step"],
          likely_assumptions: ["The employee may pitch before listening"],
          what_hearing_them_out_sounds_like: ["Good discovery", "Recommendation tied to stated goals", "Clean next step"],
          credible_next_steps: ["Tailored recommendation", "Tour or booking path", "Specific follow-up owner"],
          calm_down_if: ["The employee sounds curious and specific", "The recommendation fits"],
          lose_trust_if: ["The employee sounds generic", "The employee pushes too fast", "The employee does not answer what matters to them"],
        };
      }
      return {
        motive: "Get the issue handled by someone who sounds real, competent, and willing to own it.",
        hidden_context: "They can work with a decent employee, but they will push if the answer feels canned.",
        personality_style: "Everyday, somewhat guarded, and focused on the practical outcome.",
        past_history: "They have enough experience as a customer to notice vague service quickly.",
        pressure_context: "Moderate; the practical outcome matters more than friendliness.",
        friction_points: ["Vague reassurance", "No owner", "No timeline", "Scripted tone"],
        emotional_triggers: ["Being brushed off", "No actual answer", "Premature closure"],
        likely_assumptions: ["Someone should be able to explain the next step clearly"],
        what_hearing_them_out_sounds_like: ["Answering the real question", "Owning the next step", "Giving a usable update path"],
        credible_next_steps: ["Specific owner", "Specific action", "Specific timing"],
        calm_down_if: ["The employee is concrete and real", "The next step is credible"],
        lose_trust_if: ["The employee sounds scripted", "The employee is vague", "The employee closes too early"],
      };
  }
}
