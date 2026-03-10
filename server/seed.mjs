/**
 * WSC Training Simulator - Seed Data
 * Run: node server/seed.mjs
 * 
 * Seeds 15+ scenario templates across 3 departments,
 * sample policy documents, and demo employee profiles.
 */
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import dotenv from "dotenv";
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// ─── Scenario Templates (15+ across 3 departments) ───

const scenarioTemplates = [
  // ─── Customer Service / Front Desk (6 scenarios) ───
  {
    title: "Billing Double-Charge Dispute",
    department: "customer_service",
    scenarioFamily: "billing_confusion",
    targetRole: "Customer Service Representative",
    difficulty: 3,
    emotionalIntensity: "moderate",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Karen Mitchell",
      age_band: "40-50",
      membership_context: "Premium family member for 3 years, auto-pay enrolled",
      communication_style: "Direct, expects quick resolution, references past loyalty",
      initial_emotion: "frustrated",
      patience_level: "moderate"
    }),
    situationSummary: "Karen noticed two identical charges of $189 on her credit card statement for this month's family membership. She has been a loyal member for 3 years and is concerned about billing accuracy. The second charge was actually a processing error that has already been flagged internally but not yet refunded.",
    openingLine: "Excuse me, I need someone to explain why I was charged twice this month. That's almost $400 pulled from my account for one membership.",
    hiddenFacts: JSON.stringify([
      "The double charge was a known system glitch affecting 12 members this billing cycle",
      "A refund batch was already submitted but takes 5-7 business days to process",
      "Karen's husband called yesterday and was told 'someone would look into it' but no follow-up happened"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Acknowledge the error, confirm the refund is in process, provide a timeline",
      "Offer to have a manager call with a status update within 24 hours",
      "Document the interaction and flag for billing team follow-up"
    ]),
    requiredBehaviors: JSON.stringify([
      "Acknowledge the billing error without deflecting",
      "Apologize sincerely for the inconvenience",
      "Provide a specific refund timeline",
      "Offer to document and follow up"
    ]),
    criticalErrors: JSON.stringify([
      "Denying the double charge exists",
      "Telling the member to call their bank instead",
      "Promising an instant refund that cannot be delivered",
      "Blaming the member for not catching it sooner"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Karen calms down and shares that her husband already called. This reveals the follow-up failure.",
      if_answer_is_vague: "Karen becomes more frustrated and asks to speak with a manager.",
      if_policy_is_wrong: "Karen loses trust and threatens to cancel membership.",
      if_employee_takes_ownership: "Karen appreciates the honesty and accepts the timeline.",
      if_employee_fails_to_help: "Karen escalates to social media threat.",
      if_employee_escalates_correctly: "Karen is satisfied that someone competent is handling it."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "frustrated",
      better_if: ["Employee acknowledges error immediately", "Specific timeline given", "Ownership taken"],
      worse_if: ["Vague answers", "Blame shifting", "No follow-up offered"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Refund timeline confirmed", "Follow-up documented", "Karen acknowledged"],
      end_early_if: ["Karen demands manager and employee refuses", "Critical policy error"],
      manager_required_if: ["Karen asks for manager twice", "Employee cannot confirm refund status"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Cancellation Request with Retention Opportunity",
    department: "customer_service",
    scenarioFamily: "refund_cancellation",
    targetRole: "Customer Service Representative",
    difficulty: 4,
    emotionalIntensity: "moderate",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "David Chen",
      age_band: "30-40",
      membership_context: "Individual member for 8 months, uses gym 2x/week",
      communication_style: "Polite but firm, has already made up his mind",
      initial_emotion: "calm",
      patience_level: "high"
    }),
    situationSummary: "David wants to cancel his membership because he's moving to a new area. He's polite but decided. The club has a 30-day notice policy and there's a freeze option that might work if his move is temporary.",
    openingLine: "Hi, I need to cancel my membership. I'm moving next month and won't be able to use the club anymore.",
    hiddenFacts: JSON.stringify([
      "David's move might be temporary — his company is sending him for a 6-month project",
      "He has 2 months left on his annual commitment",
      "The club offers a 6-month freeze at $15/month that would preserve his rate"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Process the 30-day cancellation notice and explain any remaining commitment",
      "Offer the freeze option if the move might be temporary",
      "Provide clear next steps and documentation"
    ]),
    requiredBehaviors: JSON.stringify([
      "Respect the member's decision without being pushy",
      "Explain the 30-day notice policy clearly",
      "Mention the freeze option as an alternative, not a hard sell",
      "Process the request efficiently"
    ]),
    criticalErrors: JSON.stringify([
      "Refusing to process the cancellation",
      "Being overly aggressive with retention tactics",
      "Not mentioning the 30-day notice requirement",
      "Making the member feel guilty for leaving"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "David mentions the move might be temporary, opening the freeze conversation naturally.",
      if_answer_is_vague: "David becomes impatient and just wants it done.",
      if_policy_is_wrong: "David questions the policy and asks for documentation.",
      if_employee_takes_ownership: "David appreciates the professionalism and considers the freeze.",
      if_employee_fails_to_help: "David leaves frustrated and posts a negative review.",
      if_employee_escalates_correctly: "Not applicable — this should be handled at front desk level."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "calm",
      better_if: ["Respected decision", "Clear process explained", "Freeze mentioned casually"],
      worse_if: ["Pushy retention", "Unclear policy", "Made to feel guilty"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Cancellation or freeze processed", "Next steps clear", "Member satisfied"],
      end_early_if: ["Employee refuses to cancel"],
      manager_required_if: ["Member disputes the commitment terms"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Reservation Mix-Up During Peak Hours",
    department: "customer_service",
    scenarioFamily: "reservation_issue",
    targetRole: "Customer Service Representative",
    difficulty: 3,
    emotionalIntensity: "high",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Priya Sharma",
      age_band: "35-45",
      membership_context: "Gold family member, books tennis courts weekly",
      communication_style: "Assertive, time-conscious, expects systems to work",
      initial_emotion: "angry",
      patience_level: "low"
    }),
    situationSummary: "Priya booked Court 3 for 6 PM through the app, but when she arrived, another family was already playing. The system shows both reservations. She has her kids with her and drove 20 minutes to get here.",
    openingLine: "I booked this court an hour ago and someone else is on it. My kids are standing here ready to play. What is going on?",
    hiddenFacts: JSON.stringify([
      "The booking system had a sync delay that allowed a double-booking",
      "Court 5 is available in 15 minutes",
      "The other family also has a valid reservation and arrived first"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Apologize, offer Court 5 in 15 minutes with a complimentary 30-minute extension",
      "Offer a drink voucher for the family while they wait",
      "Document the system issue for IT to investigate"
    ]),
    requiredBehaviors: JSON.stringify([
      "Acknowledge the frustration immediately",
      "Do not blame the member or the other family",
      "Offer a concrete alternative quickly",
      "Compensate for the inconvenience"
    ]),
    criticalErrors: JSON.stringify([
      "Telling Priya to wait without offering an alternative",
      "Asking the other family to leave",
      "Blaming Priya for not arriving earlier",
      "Shrugging and saying 'the system must have glitched'"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Priya calms down and accepts the alternative court.",
      if_answer_is_vague: "Priya demands to speak with a manager immediately.",
      if_policy_is_wrong: "Priya threatens to cancel her membership.",
      if_employee_takes_ownership: "Priya appreciates the quick solution.",
      if_employee_fails_to_help: "Priya leaves with her kids and files a complaint.",
      if_employee_escalates_correctly: "Priya is satisfied that the issue is being handled."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "angry",
      better_if: ["Quick acknowledgment", "Concrete alternative offered", "Compensation provided"],
      worse_if: ["Slow response", "No alternative", "Blame shifting"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Alternative court offered and accepted", "Compensation provided"],
      end_early_if: ["Employee refuses to help", "No alternative available and no escalation"],
      manager_required_if: ["Priya asks for manager", "No courts available at all"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Upset Parent — Child Left Unattended in Kids Club",
    department: "customer_service",
    scenarioFamily: "upset_parent",
    targetRole: "Customer Service Representative",
    difficulty: 5,
    emotionalIntensity: "high",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "Brenda Rodriguez",
      age_band: "30-40",
      membership_context: "Premium family member, uses Kids Club 3x/week",
      communication_style: "Emotional, protective, expects accountability",
      initial_emotion: "angry",
      patience_level: "very low"
    }),
    situationSummary: "Brenda arrived to pick up her 5-year-old son from Kids Club and found him playing alone in the hallway outside the supervised area. No staff member was visible. She is furious about the safety lapse and wants answers.",
    openingLine: "I just found my five-year-old son ALONE in the hallway. Where was your staff? He could have walked out the front door!",
    hiddenFacts: JSON.stringify([
      "The Kids Club attendant stepped out for 2 minutes to get supplies from the storage room",
      "Another parent was present in the room but didn't notice the child leave",
      "This is the second time a similar incident has been reported this month",
      "The club's policy requires a minimum of 2 staff in Kids Club at all times"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Immediately ensure the child is safe and with the parent",
      "Apologize sincerely and take the concern seriously",
      "File an incident report",
      "Escalate to the Manager on Duty immediately",
      "Do NOT minimize the safety concern"
    ]),
    requiredBehaviors: JSON.stringify([
      "Prioritize child safety above all else",
      "Show genuine concern, not defensive posture",
      "Escalate to MOD without being asked",
      "File an incident report",
      "Do not make excuses for the staffing lapse"
    ]),
    criticalErrors: JSON.stringify([
      "Minimizing the safety concern",
      "Blaming the child for wandering",
      "Failing to escalate to a manager",
      "Not filing an incident report",
      "Saying 'it's not a big deal' or 'he was fine'"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Brenda calms slightly but still demands accountability and a manager.",
      if_answer_is_vague: "Brenda becomes more upset and threatens legal action.",
      if_policy_is_wrong: "Brenda completely loses trust in the club.",
      if_employee_takes_ownership: "Brenda appreciates the honesty and waits for the manager.",
      if_employee_fails_to_help: "Brenda leaves threatening to contact the media.",
      if_employee_escalates_correctly: "Brenda feels heard and waits for the manager to follow up."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "angry",
      better_if: ["Immediate safety check", "Genuine concern shown", "Manager called without prompting", "Incident report filed"],
      worse_if: ["Minimizing", "Excuses", "No escalation", "Defensive posture"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Child confirmed safe", "Incident report filed", "Manager on Duty contacted"],
      end_early_if: ["Employee minimizes the safety concern", "Employee refuses to escalate"],
      manager_required_if: ["Always — this is a safety incident that requires MOD involvement"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Membership Upgrade Inquiry",
    department: "customer_service",
    scenarioFamily: "membership_question",
    targetRole: "Customer Service Representative",
    difficulty: 2,
    emotionalIntensity: "low",
    complexity: "simple",
    customerPersona: JSON.stringify({
      name: "Tom Bradley",
      age_band: "50-60",
      membership_context: "Individual basic member for 1 year",
      communication_style: "Friendly, asks lots of questions, price-sensitive",
      initial_emotion: "curious",
      patience_level: "high"
    }),
    situationSummary: "Tom wants to understand the difference between his basic membership and the premium tier. He's interested in adding tennis and pool access but wants to make sure it's worth the extra cost.",
    openingLine: "Hey there, I've been thinking about upgrading my membership. Can you walk me through what I'd get with the premium plan?",
    hiddenFacts: JSON.stringify([
      "Tom's wife is also interested in joining, which would qualify them for a family rate",
      "There's a current promotion offering 2 months free on annual premium upgrades",
      "Tom has been using the guest pass for tennis and has already exceeded the guest limit"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Walk through the tier comparison clearly",
      "Mention the current promotion",
      "Ask about family interest to suggest the best value",
      "Offer a tour of premium facilities"
    ]),
    requiredBehaviors: JSON.stringify([
      "Be informative without being pushy",
      "Ask discovery questions about his usage",
      "Present options clearly",
      "Mention current promotions"
    ]),
    criticalErrors: JSON.stringify([
      "Pressuring the member to upgrade immediately",
      "Providing incorrect pricing",
      "Not mentioning available promotions",
      "Being dismissive of questions"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Tom mentions his wife's interest, opening the family rate conversation.",
      if_answer_is_vague: "Tom asks more specific questions about pricing.",
      if_policy_is_wrong: "Tom becomes skeptical and says he'll think about it.",
      if_employee_takes_ownership: "Tom is impressed and wants to schedule a tour.",
      if_employee_fails_to_help: "Tom leaves without upgrading and doesn't return.",
      if_employee_escalates_correctly: "Not needed for this scenario."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "curious",
      better_if: ["Clear information", "Discovery questions asked", "Promotions mentioned"],
      worse_if: ["Pressure tactics", "Vague answers", "Dismissive attitude"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Tom has clear information to make a decision", "Next steps identified"],
      end_early_if: ["Employee is overly pushy"],
      manager_required_if: ["Tom asks about a custom pricing arrangement"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Makeup Class Scheduling Conflict",
    department: "customer_service",
    scenarioFamily: "makeup_class",
    targetRole: "Customer Service Representative",
    difficulty: 3,
    emotionalIntensity: "moderate",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Lisa Park",
      age_band: "35-45",
      membership_context: "Family member, daughter enrolled in swim lessons",
      communication_style: "Organized, expects clear answers, references policies",
      initial_emotion: "concerned",
      patience_level: "moderate"
    }),
    situationSummary: "Lisa's daughter missed 2 swim lessons due to illness. She wants to schedule makeup classes but the current session is almost full. The policy allows makeups within the same session period only.",
    openingLine: "My daughter missed two swim lessons because she was sick. I need to get those made up before the session ends next week.",
    hiddenFacts: JSON.stringify([
      "There is one available slot on Thursday that could work",
      "The instructor has offered to do a private 30-minute catch-up if scheduled this week",
      "The policy technically requires 24-hour cancellation notice, which Lisa didn't provide"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Check available makeup slots and offer the Thursday option",
      "Mention the instructor's catch-up offer",
      "Be flexible given the illness circumstance",
      "Document the makeup scheduling"
    ]),
    requiredBehaviors: JSON.stringify([
      "Show understanding about the illness",
      "Check availability proactively",
      "Offer concrete options",
      "Be flexible within policy guidelines"
    ]),
    criticalErrors: JSON.stringify([
      "Rigidly enforcing the 24-hour notice policy for illness",
      "Saying 'nothing we can do'",
      "Not checking available slots",
      "Being unsympathetic about the child's illness"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Lisa is grateful and flexible about timing.",
      if_answer_is_vague: "Lisa pushes for specific dates and times.",
      if_policy_is_wrong: "Lisa asks to see the written policy.",
      if_employee_takes_ownership: "Lisa appreciates the effort and books the makeup.",
      if_employee_fails_to_help: "Lisa complains to the aquatics director.",
      if_employee_escalates_correctly: "Lisa is satisfied with the resolution path."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "concerned",
      better_if: ["Empathy shown", "Options provided", "Flexibility demonstrated"],
      worse_if: ["Rigid policy enforcement", "No options", "Unsympathetic"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Makeup class scheduled or clear path provided"],
      end_early_if: ["Employee refuses to help"],
      manager_required_if: ["No slots available and member insists"]
    }),
    recommendedTurns: 3,
    isActive: true
  },

  // ─── Golf / Sales-Service Hybrid (5 scenarios) ───
  {
    title: "Hesitant Golf Prospect Tour",
    department: "golf",
    scenarioFamily: "hesitant_prospect",
    targetRole: "Golf Sales-Service Associate",
    difficulty: 3,
    emotionalIntensity: "low",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Mark Thompson",
      age_band: "45-55",
      membership_context: "Non-member, visiting for the first time, referred by a friend",
      communication_style: "Reserved, analytical, compares value before committing",
      initial_emotion: "skeptical",
      patience_level: "high"
    }),
    situationSummary: "Mark was referred by a friend and is touring the golf facilities. He's interested but cautious about the cost. He plays twice a week at a public course and is evaluating whether the club membership is worth the premium.",
    openingLine: "My buddy Dave told me to check this place out. I play a couple times a week but I'm not sure I need a club membership. What makes this different from the public course?",
    hiddenFacts: JSON.stringify([
      "Mark's friend Dave is a premium member who could sponsor a trial week",
      "Mark's company has a corporate wellness benefit that could offset 30% of membership",
      "Mark is also looking at two other clubs in the area"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Focus on value, not just features",
      "Ask about his playing habits to personalize the pitch",
      "Mention the trial week option through Dave's sponsorship",
      "Don't pressure — let the facilities speak for themselves"
    ]),
    requiredBehaviors: JSON.stringify([
      "Ask discovery questions about his golf habits",
      "Highlight specific value propositions relevant to his usage",
      "Mention trial options without pressure",
      "Be honest about what the club offers vs. public courses"
    ]),
    criticalErrors: JSON.stringify([
      "Hard-selling or pressuring for immediate sign-up",
      "Badmouthing public courses",
      "Not asking about his needs before pitching",
      "Quoting incorrect pricing"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Mark opens up about his corporate benefit, creating a natural pricing conversation.",
      if_answer_is_vague: "Mark remains skeptical and says he'll think about it.",
      if_policy_is_wrong: "Mark catches the error and loses trust.",
      if_employee_takes_ownership: "Mark is impressed and asks about next steps.",
      if_employee_fails_to_help: "Mark leaves without interest.",
      if_employee_escalates_correctly: "Mark appreciates being connected to the right person."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "skeptical",
      better_if: ["Personalized approach", "Value-focused", "No pressure", "Trial offered"],
      worse_if: ["Generic pitch", "Pressure tactics", "Ignored questions"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Mark has clear next steps", "Trial or follow-up scheduled"],
      end_early_if: ["Employee is too pushy"],
      manager_required_if: ["Mark asks about corporate rates that require approval"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Golf Lesson Inquiry and Scheduling",
    department: "golf",
    scenarioFamily: "lesson_inquiry",
    targetRole: "Golf Sales-Service Associate",
    difficulty: 2,
    emotionalIntensity: "low",
    complexity: "simple",
    customerPersona: JSON.stringify({
      name: "Sarah Kim",
      age_band: "25-35",
      membership_context: "New member, joined last month, beginner golfer",
      communication_style: "Enthusiastic but unsure, asks for recommendations",
      initial_emotion: "excited",
      patience_level: "high"
    }),
    situationSummary: "Sarah just joined and wants to start golf lessons. She's a complete beginner and doesn't know what program would be best for her. The club offers group clinics, semi-private, and private lessons.",
    openingLine: "Hi! I just joined and I really want to learn golf. I have no idea where to start though. What do you recommend for a total beginner?",
    hiddenFacts: JSON.stringify([
      "The beginner group clinic starting next week has 2 spots left",
      "Sarah's membership includes one free assessment session with a pro",
      "The club has a women's beginner series that starts monthly"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Recommend the free assessment first",
      "Suggest the beginner group clinic as an affordable starting point",
      "Mention the women's series as an option",
      "Help her book the assessment on the spot"
    ]),
    requiredBehaviors: JSON.stringify([
      "Be welcoming and encouraging",
      "Explain options clearly without overwhelming",
      "Mention the free assessment benefit",
      "Help with immediate next steps"
    ]),
    criticalErrors: JSON.stringify([
      "Pushing expensive private lessons on a beginner",
      "Being condescending about her skill level",
      "Not mentioning the free assessment included in membership",
      "Overwhelming her with too many options"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Sarah is excited and wants to book immediately.",
      if_answer_is_vague: "Sarah asks more specific questions about pricing.",
      if_policy_is_wrong: "Sarah is confused and asks to come back later.",
      if_employee_takes_ownership: "Sarah books the assessment and the clinic on the spot.",
      if_employee_fails_to_help: "Sarah leaves overwhelmed and doesn't follow up.",
      if_employee_escalates_correctly: "Sarah is connected with the right instructor."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "excited",
      better_if: ["Encouraging tone", "Clear recommendations", "Easy next steps"],
      worse_if: ["Condescending", "Overwhelming", "Pushy upselling"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Sarah has a clear plan and next step booked"],
      end_early_if: ["Employee is condescending"],
      manager_required_if: ["Never needed for this scenario"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Driving Range Equipment Complaint",
    department: "golf",
    scenarioFamily: "range_complaint",
    targetRole: "Golf Sales-Service Associate",
    difficulty: 3,
    emotionalIntensity: "moderate",
    complexity: "simple",
    customerPersona: JSON.stringify({
      name: "Robert Hayes",
      age_band: "55-65",
      membership_context: "Long-time premium member, uses range daily",
      communication_style: "Gruff, expects high standards, compares to other clubs",
      initial_emotion: "frustrated",
      patience_level: "low"
    }),
    situationSummary: "Robert is frustrated that the ball dispenser on Bay 12 has been broken for a week and the range mats haven't been replaced despite being worn through. He pays premium dues and expects premium maintenance.",
    openingLine: "That ball machine on Bay 12 has been broken for a week now. And these mats look like they're from 2010. I pay good money here — when is this getting fixed?",
    hiddenFacts: JSON.stringify([
      "The ball dispenser part was ordered 3 days ago and arrives tomorrow",
      "New mats are in the budget for next month's facilities refresh",
      "Robert complained about the mats 2 months ago and was told they'd be replaced 'soon'"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Acknowledge the issue and provide specific timelines",
      "Apologize for the delay on the mats",
      "Offer Bay 8 which has newer mats as an immediate alternative",
      "Document the complaint for the facilities manager"
    ]),
    requiredBehaviors: JSON.stringify([
      "Take the complaint seriously",
      "Provide specific timelines, not vague promises",
      "Offer an immediate alternative",
      "Follow up on the previous mat complaint"
    ]),
    criticalErrors: JSON.stringify([
      "Dismissing the complaint",
      "Saying 'I don't know' without offering to find out",
      "Making another vague promise about the mats",
      "Being defensive about maintenance standards"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Robert reveals he complained about mats before, testing follow-through.",
      if_answer_is_vague: "Robert becomes more frustrated and asks for the manager.",
      if_policy_is_wrong: "Robert says he'll look at other clubs.",
      if_employee_takes_ownership: "Robert appreciates the honesty and accepts the alternative.",
      if_employee_fails_to_help: "Robert writes a formal complaint to the GM.",
      if_employee_escalates_correctly: "Robert is satisfied someone is taking action."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "frustrated",
      better_if: ["Specific timelines", "Immediate alternative", "Ownership taken"],
      worse_if: ["Vague promises", "Dismissive", "No alternative"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Timeline provided", "Alternative offered", "Complaint documented"],
      end_early_if: ["Employee dismisses the complaint"],
      manager_required_if: ["Robert asks for manager after vague response"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Golf Credit Refund Request",
    department: "golf",
    scenarioFamily: "refund_credit",
    targetRole: "Golf Sales-Service Associate",
    difficulty: 4,
    emotionalIntensity: "moderate",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "James O'Brien",
      age_band: "40-50",
      membership_context: "Premium member, purchased a 10-round golf package",
      communication_style: "Business-like, expects fair treatment, references value",
      initial_emotion: "frustrated",
      patience_level: "moderate"
    }),
    situationSummary: "James purchased a 10-round golf package 3 months ago but has only used 4 rounds. He's been injured and can't play for the next 2 months. He wants a refund or credit for the unused rounds. The package terms say 'non-refundable' but the club has discretion for medical situations.",
    openingLine: "I bought the 10-round package but I tore my rotator cuff and can't play for at least two months. I've only used four rounds. I need some kind of credit or refund for the rest.",
    hiddenFacts: JSON.stringify([
      "The club has a medical exception policy that allows credit extensions",
      "James can provide a doctor's note",
      "His package expires in 30 days, which is before he'll be cleared to play"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Acknowledge the injury and express concern",
      "Explain the medical exception policy",
      "Offer to extend the package expiration by 3 months with a doctor's note",
      "Escalate to golf director if a refund is requested"
    ]),
    requiredBehaviors: JSON.stringify([
      "Show empathy for the injury",
      "Know or look up the medical exception policy",
      "Offer the extension option",
      "Be clear about what requires manager approval"
    ]),
    criticalErrors: JSON.stringify([
      "Flatly refusing any accommodation",
      "Not knowing about the medical exception policy",
      "Promising a refund without authority",
      "Being unsympathetic about the injury"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "James is reasonable and accepts the extension option.",
      if_answer_is_vague: "James pushes harder for a refund.",
      if_policy_is_wrong: "James asks to speak with the golf director.",
      if_employee_takes_ownership: "James appreciates the solution and provides the doctor's note.",
      if_employee_fails_to_help: "James disputes the charge with his credit card company.",
      if_employee_escalates_correctly: "James is satisfied to speak with someone who can authorize the credit."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "frustrated",
      better_if: ["Empathy shown", "Medical policy mentioned", "Extension offered"],
      worse_if: ["Flat refusal", "No policy knowledge", "Unsympathetic"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Extension offered or escalated to golf director"],
      end_early_if: ["Employee flatly refuses any accommodation"],
      manager_required_if: ["James insists on a monetary refund"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Golf Membership Value Explanation",
    department: "golf",
    scenarioFamily: "value_explanation",
    targetRole: "Golf Sales-Service Associate",
    difficulty: 3,
    emotionalIntensity: "moderate",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Patricia Wells",
      age_band: "50-60",
      membership_context: "Premium member for 5 years, considering downgrade",
      communication_style: "Direct, value-conscious, loyal but questioning",
      initial_emotion: "concerned",
      patience_level: "moderate"
    }),
    situationSummary: "Patricia has been a premium member for 5 years but is questioning whether the golf membership is worth the annual increase. She's comparing costs to nearby public courses and considering a downgrade to basic.",
    openingLine: "I got the renewal notice and the rate went up again. I love this club but I'm starting to wonder if I'm getting my money's worth compared to just playing public courses.",
    hiddenFacts: JSON.stringify([
      "Patricia uses the range 4x/week, which alone would cost $200/month at public rates",
      "She hasn't used the included club fitting benefit worth $150",
      "A loyalty discount of 10% is available for 5+ year members but must be requested"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Help Patricia calculate her actual usage value",
      "Highlight benefits she hasn't used yet",
      "Mention the loyalty discount",
      "Respect her decision if she still wants to downgrade"
    ]),
    requiredBehaviors: JSON.stringify([
      "Listen to her concerns without being defensive",
      "Help her see the value through her own usage",
      "Mention unused benefits",
      "Offer the loyalty discount proactively"
    ]),
    criticalErrors: JSON.stringify([
      "Being defensive about the price increase",
      "Not knowing about the loyalty discount",
      "Pressuring her to stay without addressing concerns",
      "Dismissing her comparison to public courses"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Patricia realizes she's getting more value than she thought.",
      if_answer_is_vague: "Patricia leans toward downgrading.",
      if_policy_is_wrong: "Patricia loses confidence in the staff.",
      if_employee_takes_ownership: "Patricia appreciates the analysis and renews.",
      if_employee_fails_to_help: "Patricia downgrades and reduces her visits.",
      if_employee_escalates_correctly: "Patricia is connected with the membership director for a full review."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "concerned",
      better_if: ["Value demonstrated", "Unused benefits highlighted", "Loyalty discount offered"],
      worse_if: ["Defensive", "No value analysis", "Pressure without substance"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Patricia has a clear picture of her value", "Decision supported either way"],
      end_early_if: ["Employee is dismissive of her concerns"],
      manager_required_if: ["Patricia asks about a custom rate"]
    }),
    recommendedTurns: 4,
    isActive: true
  },

  // ─── MOD / Emergency / Facilities-Adjacent (5 scenarios) ───
  {
    title: "Slippery Entry Complaint After Rain",
    department: "mod_emergency",
    scenarioFamily: "facility_complaint",
    targetRole: "Manager on Duty",
    difficulty: 4,
    emotionalIntensity: "high",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "George Franklin",
      age_band: "65-75",
      membership_context: "Senior member for 10 years, uses the club daily",
      communication_style: "Concerned, references safety, mentions his age",
      initial_emotion: "concerned",
      patience_level: "moderate"
    }),
    situationSummary: "George nearly slipped on the wet tile floor near the main entrance after a rainstorm. No wet floor signs were out and no mats were placed. He's concerned about safety, especially for older members.",
    openingLine: "I almost went down on that tile floor by the entrance. It's pouring outside and there's not a single wet floor sign or mat. Someone my age could break a hip out there.",
    hiddenFacts: JSON.stringify([
      "The facilities team was supposed to place mats 30 minutes ago but got pulled to another task",
      "A similar slip-and-fall incident happened 6 months ago and resulted in an insurance claim",
      "The club's safety protocol requires mats and signs within 15 minutes of rain starting"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Immediately address the safety hazard — place mats and signs NOW",
      "Thank George for reporting it",
      "File an incident report even though no injury occurred",
      "Follow up with facilities team on the protocol failure"
    ]),
    requiredBehaviors: JSON.stringify([
      "Take immediate action on the safety hazard",
      "Thank the member for reporting",
      "File a near-miss incident report",
      "Show genuine concern for member safety",
      "Follow up with the facilities team"
    ]),
    criticalErrors: JSON.stringify([
      "Not taking immediate action on the hazard",
      "Minimizing the safety concern",
      "Not filing an incident report",
      "Blaming the member for not being careful",
      "Saying 'we'll get to it'"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "George mentions the previous slip incident, revealing the pattern.",
      if_answer_is_vague: "George becomes more agitated about liability.",
      if_policy_is_wrong: "George threatens to contact his attorney.",
      if_employee_takes_ownership: "George is satisfied that action is being taken.",
      if_employee_fails_to_help: "George files a formal safety complaint with the board.",
      if_employee_escalates_correctly: "George appreciates the professionalism."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "concerned",
      better_if: ["Immediate action", "Genuine concern", "Incident report filed"],
      worse_if: ["Delayed response", "Minimizing", "No documentation"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Hazard addressed immediately", "Incident report filed", "Follow-up planned"],
      end_early_if: ["MOD fails to take immediate action"],
      manager_required_if: ["This IS the manager scenario"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Power Outage During Evening Programs",
    department: "mod_emergency",
    scenarioFamily: "weather_power",
    targetRole: "Manager on Duty",
    difficulty: 5,
    emotionalIntensity: "high",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "Multiple Members",
      age_band: "mixed",
      membership_context: "Various members present during evening programs",
      communication_style: "Confused, looking for direction, some anxious",
      initial_emotion: "confused",
      patience_level: "moderate"
    }),
    situationSummary: "The power goes out during peak evening hours. The pool has swimmers, the gym has members on equipment, Kids Club has 15 children, and a birthday party is in the event room. Emergency lighting is on but the backup generator hasn't kicked in.",
    openingLine: "The lights just went out! My kids are in the pool — is everyone safe? What's happening?",
    hiddenFacts: JSON.stringify([
      "The backup generator failed its last test 2 weeks ago and maintenance was scheduled but not completed",
      "Pool emergency lighting is working but the filtration system is off",
      "The birthday party has 20 children and 4 adults in the event room",
      "Cell service is spotty in the building during storms"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Activate emergency protocol: account for all members, especially children",
      "Clear the pool immediately — no swimming without filtration",
      "Secure Kids Club and birthday party children with their guardians",
      "Contact facilities/maintenance about the generator",
      "Communicate status updates to all members present"
    ]),
    requiredBehaviors: JSON.stringify([
      "Stay calm and take command",
      "Prioritize safety: pool evacuation, child accountability",
      "Communicate clearly and frequently",
      "Follow emergency protocol",
      "Document everything"
    ]),
    criticalErrors: JSON.stringify([
      "Panicking or appearing unsure",
      "Not evacuating the pool",
      "Not accounting for all children",
      "Waiting for someone else to take charge",
      "Telling members 'it'll come back on soon' without taking action"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Members cooperate and help with child accountability.",
      if_answer_is_vague: "Members become more anxious and start leaving without checking out.",
      if_policy_is_wrong: "Members lose confidence and someone calls 911.",
      if_employee_takes_ownership: "Members feel safe and follow instructions.",
      if_employee_fails_to_help: "Chaos ensues and someone gets hurt in the dark.",
      if_employee_escalates_correctly: "Emergency services are contacted appropriately."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "confused",
      better_if: ["Calm authority", "Clear instructions", "Child safety prioritized", "Regular updates"],
      worse_if: ["Panic", "No direction", "Children unaccounted for", "Silence"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["All members accounted for", "Pool evacuated", "Children secured", "Status communicated"],
      end_early_if: ["MOD fails to take any action within first response"],
      manager_required_if: ["This IS the manager scenario — escalate to GM if generator doesn't restart"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Unsafe Equipment Report — Frayed Cable on Cable Machine",
    department: "mod_emergency",
    scenarioFamily: "unsafe_equipment",
    targetRole: "Manager on Duty",
    difficulty: 4,
    emotionalIntensity: "moderate",
    complexity: "mixed",
    customerPersona: JSON.stringify({
      name: "Derek Williams",
      age_band: "30-40",
      membership_context: "Regular member, fitness enthusiast, uses gym 5x/week",
      communication_style: "Direct, safety-conscious, expects immediate action",
      initial_emotion: "concerned",
      patience_level: "moderate"
    }),
    situationSummary: "Derek noticed a frayed cable on the lat pulldown machine while using it. He stopped immediately and is reporting it. The cable shows visible wear and could snap under load.",
    openingLine: "Hey, I need to report something. The cable on the lat pulldown in the back corner is frayed pretty badly. I was mid-set when I noticed it. That thing could snap on someone.",
    hiddenFacts: JSON.stringify([
      "This machine was flagged for inspection 3 weeks ago but the work order wasn't completed",
      "Two other members mentioned the cable looked worn last week but it wasn't documented",
      "The equipment maintenance log shows the last inspection was 4 months ago"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Take the machine out of service IMMEDIATELY",
      "Thank Derek for reporting",
      "Place an out-of-service sign and barrier",
      "File an equipment safety report",
      "Contact the equipment vendor for emergency repair"
    ]),
    requiredBehaviors: JSON.stringify([
      "Take immediate action to remove the machine from service",
      "Thank the member for reporting",
      "File a safety report",
      "Follow up on the maintenance gap",
      "Communicate to staff about the hazard"
    ]),
    criticalErrors: JSON.stringify([
      "Not immediately taking the machine out of service",
      "Saying 'it's probably fine'",
      "Not filing a safety report",
      "Letting other members use the machine",
      "Not following up on the maintenance failure"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Derek mentions other members noticed it too, revealing the reporting gap.",
      if_answer_is_vague: "Derek insists on seeing the machine tagged out before he leaves.",
      if_policy_is_wrong: "Derek questions the club's safety standards.",
      if_employee_takes_ownership: "Derek is satisfied and continues his workout.",
      if_employee_fails_to_help: "Derek posts about it on social media.",
      if_employee_escalates_correctly: "Derek appreciates the thorough response."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "concerned",
      better_if: ["Immediate action", "Machine tagged out", "Safety report filed"],
      worse_if: ["Delayed action", "Minimizing", "Machine left in service"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Machine out of service", "Safety report filed", "Vendor contacted"],
      end_early_if: ["MOD doesn't take the machine out of service"],
      manager_required_if: ["This IS the manager scenario"]
    }),
    recommendedTurns: 3,
    isActive: true
  },
  {
    title: "Weather Closure — Lightning During Outdoor Golf",
    department: "mod_emergency",
    scenarioFamily: "weather_incident",
    targetRole: "Manager on Duty",
    difficulty: 5,
    emotionalIntensity: "high",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "Multiple Golfers",
      age_band: "mixed",
      membership_context: "Various members and guests on the course",
      communication_style: "Resistant to stopping play, some dismissive of danger",
      initial_emotion: "frustrated",
      patience_level: "low"
    }),
    situationSummary: "Lightning has been detected within 8 miles of the club. Per policy, the course must be cleared immediately. Several groups are mid-round and resistant to coming in. One group is on the far side of the course near the tree line.",
    openingLine: "We just started the back nine! It's barely sprinkling. You can't seriously be pulling us off the course right now.",
    hiddenFacts: JSON.stringify([
      "Lightning was detected 8 miles away and moving toward the club",
      "The club's insurance requires course closure when lightning is within 10 miles",
      "A golfer was struck by lightning at a nearby course 2 years ago",
      "The group on hole 14 near the tree line is in the highest-risk position"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Clear the course immediately — no exceptions",
      "Use the horn system and cart runners to notify all groups",
      "Prioritize the group near the tree line",
      "Offer rain checks or credit for interrupted rounds",
      "Do not allow play to resume until 30 minutes after the last detected strike"
    ]),
    requiredBehaviors: JSON.stringify([
      "Be firm but respectful about the closure",
      "Explain the safety reason clearly",
      "Prioritize the most at-risk groups",
      "Offer compensation for the interruption",
      "Do not negotiate on safety"
    ]),
    criticalErrors: JSON.stringify([
      "Allowing play to continue",
      "Negotiating or bending the lightning policy",
      "Not prioritizing the group near the tree line",
      "Being apologetic to the point of seeming unsure",
      "Not offering any compensation"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Golfers accept the closure and appreciate the rain check offer.",
      if_answer_is_vague: "Golfers argue and try to keep playing.",
      if_policy_is_wrong: "Golfers refuse to leave, creating a liability situation.",
      if_employee_takes_ownership: "Golfers respect the authority and come in.",
      if_employee_fails_to_help: "Golfers stay on the course and the club faces liability.",
      if_employee_escalates_correctly: "All groups are safely off the course."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "frustrated",
      better_if: ["Firm but respectful", "Clear safety explanation", "Rain checks offered"],
      worse_if: ["Wishy-washy", "No compensation", "Seems unsure"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["All golfers off the course", "Rain checks issued", "Safety maintained"],
      end_early_if: ["MOD allows play to continue during lightning"],
      manager_required_if: ["This IS the manager scenario — escalate to GM if golfers physically refuse"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
  {
    title: "Pool Emergency — Child Injury with No Lifeguard Visible",
    department: "mod_emergency",
    scenarioFamily: "safety_incident",
    targetRole: "Manager on Duty",
    difficulty: 5,
    emotionalIntensity: "high",
    complexity: "ambiguous",
    customerPersona: JSON.stringify({
      name: "Michael Torres",
      age_band: "35-45",
      membership_context: "Family member, son is in swim team",
      communication_style: "Urgent, protective, demands accountability",
      initial_emotion: "angry",
      patience_level: "very low"
    }),
    situationSummary: "Michael's 8-year-old son slipped on the pool deck and hit his head. When Michael looked for the lifeguard, the chair was empty. Another parent helped apply pressure to the cut. Michael is calling the front desk demanding the MOD immediately.",
    openingLine: "My son just cracked his head open on your pool deck and there was NO lifeguard on duty. I need a manager RIGHT NOW. Where is your staff?",
    hiddenFacts: JSON.stringify([
      "The lifeguard went to the bathroom and didn't arrange coverage — a protocol violation",
      "The pool deck was recently resurfaced but the non-slip coating hasn't been applied to the new section",
      "First aid kit at the pool station is missing butterfly bandages",
      "This is the same pool area where a slip was reported last month"
    ]),
    approvedResolutionPaths: JSON.stringify([
      "Get to the pool IMMEDIATELY",
      "Assess the child's injury — call 911 if head injury is significant",
      "Administer first aid",
      "File an incident report",
      "Contact the child's emergency contact if needed",
      "Address the lifeguard staffing failure",
      "Do NOT admit liability but DO show genuine concern and take action"
    ]),
    requiredBehaviors: JSON.stringify([
      "Respond with urgency — get to the scene immediately",
      "Assess the injury and provide/arrange first aid",
      "Show genuine concern for the child",
      "File an incident report",
      "Address the staffing gap honestly",
      "Do not make liability admissions but do not be cold or corporate"
    ]),
    criticalErrors: JSON.stringify([
      "Not responding with urgency",
      "Not assessing the injury",
      "Making excuses for the missing lifeguard",
      "Not filing an incident report",
      "Being more concerned about liability than the child",
      "Not calling 911 if the injury warrants it"
    ]),
    branchLogic: JSON.stringify({
      if_empathy_is_strong: "Michael calms enough to let you assess his son. Reveals the non-slip coating issue.",
      if_answer_is_vague: "Michael threatens legal action and demands corporate contact information.",
      if_policy_is_wrong: "Michael completely loses trust and calls 911 himself.",
      if_employee_takes_ownership: "Michael allows first aid and cooperates with the incident report.",
      if_employee_fails_to_help: "Michael leaves with his son and contacts an attorney.",
      if_employee_escalates_correctly: "Michael feels the situation is being handled professionally."
    }),
    emotionProgression: JSON.stringify({
      starting_state: "angry",
      better_if: ["Immediate response", "Child assessed first", "Genuine concern", "Incident documented"],
      worse_if: ["Slow response", "Excuses", "Corporate tone", "No documentation"]
    }),
    completionRules: JSON.stringify({
      resolved_if: ["Child assessed and treated", "Incident report filed", "Staffing issue addressed"],
      end_early_if: ["MOD fails to respond with urgency", "MOD makes excuses instead of taking action"],
      manager_required_if: ["This IS the manager scenario — escalate to GM for the staffing violation"]
    }),
    recommendedTurns: 4,
    isActive: true
  },
];

// ─── Policy Documents ───

const policyDocs = [
  {
    title: "WSC Billing & Refund Policy",
    department: "customer_service",
    scenarioFamilies: JSON.stringify(["billing_confusion", "refund_cancellation"]),
    content: `Woodinville Sports Club — Billing & Refund Policy

1. BILLING CYCLE: All memberships are billed on the 1st of each month via the payment method on file.
2. DOUBLE CHARGES: If a double charge occurs, acknowledge the error, confirm the refund is in process, and provide a 5-7 business day timeline. Never tell the member to contact their bank first.
3. CANCELLATION: Requires 30-day written notice. Members on annual commitments must fulfill the term or pay an early termination fee equal to 2 months' dues.
4. REFUNDS: Processed within 5-7 business days. Partial-month refunds are prorated. Package purchases (lessons, rounds) are non-refundable but may be extended for medical reasons with documentation.
5. FREEZE OPTION: Available for up to 6 months at $15/month. Preserves the member's rate. Requires written request.
6. MEDICAL EXCEPTIONS: Members with documented medical conditions may receive package extensions, freeze without fee, or early termination without penalty. Requires a doctor's note.
7. LOYALTY DISCOUNT: Members with 5+ years of continuous membership qualify for a 10% loyalty discount on renewal. Must be requested — not automatic.`,
    isActive: true
  },
  {
    title: "WSC Safety & Emergency Protocol",
    department: "mod_emergency",
    scenarioFamilies: JSON.stringify(["safety_incident", "weather_power", "facility_complaint", "unsafe_equipment", "weather_incident"]),
    content: `Woodinville Sports Club — Safety & Emergency Protocol

1. INCIDENT REPORTING: ALL incidents, near-misses, and safety concerns must be documented in an incident report within 1 hour of occurrence. No exceptions.
2. POOL SAFETY: Minimum 1 certified lifeguard on duty whenever the pool is open. Lifeguards must arrange coverage before leaving the deck for any reason. Pool must be evacuated if lifeguard coverage drops below minimum.
3. LIGHTNING POLICY: Course and outdoor facilities must be cleared when lightning is detected within 10 miles. Use the horn system (3 blasts = clear the course). Play may not resume until 30 minutes after the last detected strike. Rain checks must be offered for interrupted rounds.
4. WET FLOOR PROTOCOL: Mats and wet floor signs must be placed within 15 minutes of rain starting. Entrance, locker rooms, and pool deck are priority areas.
5. EQUIPMENT SAFETY: Any equipment with visible damage (frayed cables, cracked frames, loose bolts) must be taken out of service IMMEDIATELY. Tag with out-of-service sign, file equipment safety report, contact vendor.
6. KIDS CLUB: Minimum 2 staff members at all times when children are present. Children may not be left unattended. Staff must maintain a headcount log updated every 15 minutes.
7. POWER OUTAGE: Activate emergency protocol. Priority order: (1) Pool evacuation, (2) Child accountability in Kids Club and events, (3) Gym equipment safety, (4) Member communication. Contact facilities for generator status.
8. FIRST AID: All MODs must be first-aid certified. Assess injuries before calling 911. Do not move head/neck injury victims. Document everything.
9. LIABILITY: Show genuine concern and take action. Do NOT admit fault or make liability statements. Do NOT say "it's not a big deal." File incident reports for ALL safety events.`,
    isActive: true
  },
  {
    title: "WSC Golf Operations Policy",
    department: "golf",
    scenarioFamilies: JSON.stringify(["hesitant_prospect", "lesson_inquiry", "range_complaint", "refund_credit", "value_explanation"]),
    content: `Woodinville Sports Club — Golf Operations Policy

1. PROSPECT TOURS: Focus on value, not features. Ask discovery questions first. Mention trial options. Never hard-sell or badmouth competitors.
2. LESSON PROGRAMS: Beginner group clinic ($45/session), semi-private ($75/session), private ($120/session). All new members receive one free assessment session with a pro.
3. WOMEN'S SERIES: Monthly beginner series, 4 sessions for $150. Starts first Monday of each month.
4. RANGE PRICING: Members: unlimited with premium membership, $15/bucket for basic. Non-members: $20/bucket.
5. EQUIPMENT MAINTENANCE: Range mats replaced annually. Ball dispensers serviced monthly. Report issues immediately — do not tell members "we'll get to it."
6. GOLF PACKAGES: 10-round package ($450 members, $600 non-members). Valid for 6 months. Non-refundable but extendable for medical reasons with documentation.
7. CORPORATE RATES: Available for companies with 5+ employee memberships. Requires approval from the membership director.
8. RAIN POLICY: Rounds interrupted by weather receive rain checks valid for 30 days. No refunds for weather interruptions.
9. TRIAL MEMBERSHIP: Existing members can sponsor a 1-week trial for prospective members. Limit 2 trials per sponsor per year.
10. RATE INCREASES: Annual rate adjustments communicated 60 days before renewal. Loyalty discount (10% for 5+ year members) available upon request.`,
    isActive: true
  },
  {
    title: "WSC Reservations & Scheduling Policy",
    department: "customer_service",
    scenarioFamilies: JSON.stringify(["reservation_issue", "makeup_class"]),
    content: `Woodinville Sports Club — Reservations & Scheduling Policy

1. COURT RESERVATIONS: Book up to 7 days in advance via app or front desk. 24-hour cancellation required or $10 no-show fee.
2. DOUBLE BOOKINGS: If a system error causes a double booking, the first arrival has priority. Offer the displaced member an alternative court, time extension, or complimentary drink voucher.
3. SWIM LESSONS: 8-week sessions. Makeup classes allowed within the same session period. 24-hour cancellation notice required, but illness exceptions should be handled with flexibility.
4. MAKEUP CLASSES: Check available slots proactively. Instructors may offer catch-up sessions. Be flexible for illness-related absences — do not rigidly enforce the cancellation notice for sick children.
5. PEAK HOURS: Saturday 8am-12pm, weekday evenings 5-8pm. Premium members have priority booking during peak hours.
6. GROUP EVENTS: Birthday parties and group events require 2-week advance booking. $100 deposit required, refundable with 48-hour cancellation notice.`,
    isActive: true
  },
];

// ─── Run Seed ───

async function seed() {
  console.log("🌱 Seeding WSC Training Simulator...\n");

  // Seed scenario templates
  console.log(`📋 Inserting ${scenarioTemplates.length} scenario templates...`);
  for (const template of scenarioTemplates) {
    await db.execute(sql`
      INSERT INTO scenario_templates (
        title, department, scenarioFamily, targetRole, difficulty,
        emotionalIntensity, complexity, customerPersona, situationSummary,
        openingLine, hiddenFacts, approvedResolutionPaths, requiredBehaviors,
        criticalErrors, branchLogic, emotionProgression, completionRules,
        recommendedTurns, isActive
      ) VALUES (
        ${template.title}, ${template.department}, ${template.scenarioFamily},
        ${template.targetRole}, ${template.difficulty}, ${template.emotionalIntensity},
        ${template.complexity}, ${template.customerPersona}, ${template.situationSummary},
        ${template.openingLine}, ${template.hiddenFacts}, ${template.approvedResolutionPaths},
        ${template.requiredBehaviors}, ${template.criticalErrors}, ${template.branchLogic},
        ${template.emotionProgression}, ${template.completionRules},
        ${template.recommendedTurns}, ${template.isActive}
      )
    `);
    console.log(`  ✅ ${template.title}`);
  }

  // Seed policy documents
  console.log(`\n📄 Inserting ${policyDocs.length} policy documents...`);
  for (const doc of policyDocs) {
    await db.execute(sql`
      INSERT INTO policy_documents (
        title, department, scenarioFamilies, content, isActive
      ) VALUES (
        ${doc.title}, ${doc.department}, ${doc.scenarioFamilies},
        ${doc.content}, ${doc.isActive}
      )
    `);
    console.log(`  ✅ ${doc.title}`);
  }

  console.log("\n✨ Seed complete!");
  console.log(`  ${scenarioTemplates.length} scenario templates`);
  console.log(`  ${policyDocs.length} policy documents`);
  console.log(`  3 departments: customer_service, golf, mod_emergency`);
  console.log(`  Difficulty range: 2-5`);

  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
