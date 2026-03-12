import { departmentLabels, familyLabels } from "../../shared/wsc-content";
import { normalizePolicyScenarioFamilies } from "./policy-matching";

const FAMILY_KEYWORDS: Record<string, string[]> = {
  billing_confusion: ["billing", "double charge", "duplicate charge", "pending charge", "statement", "autopay", "ledger"],
  cancellation_request: ["cancel", "cancellation", "terminate", "termination", "notice", "freeze request"],
  reservation_issue: ["reservation", "booking", "booked", "slot", "court time", "class spot"],
  upset_parent: ["parent", "guardian", "child", "children", "youth", "kid", "minor"],
  membership_question: ["membership", "dues", "enrollment", "upgrade", "downgrade", "freeze policy"],
  member_complaint: ["complaint", "service recovery", "bad experience", "dissatisfied", "frustrated member"],
  hesitant_prospect: ["prospect", "tour", "interested", "thinking about joining", "not sure", "hesitant"],
  lesson_inquiry: ["lesson", "lessons", "instruction", "instructor", "coach", "teaching pro"],
  range_complaint: ["range", "golf range", "mat", "bay", "range ball", "tee line"],
  refund_credit_request: ["refund", "credit", "credit request", "adjustment", "compensation", "chargeback"],
  value_explanation: ["value", "benefit", "pricing", "price", "worth", "package"],
  slippery_entry_complaint: ["slippery", "wet floor", "spill", "entry", "lobby", "slip hazard"],
  power_interruption_confusion: ["power", "outage", "lights", "system down", "interruption", "electric"],
  unsafe_equipment_report: ["unsafe equipment", "broken equipment", "machine", "equipment", "tag out", "out of service"],
  weather_range_incident: ["weather", "lightning", "thunder", "wind", "storm", "range closure"],
  emergency_response: ["911", "ems", "collapsed", "collapse", "medical", "unresponsive", "bleeding", "patient", "care arrives", "stabilize"],
};

const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  customer_service: [
    "front desk",
    "membership",
    "billing",
    "reservation",
    "member",
    "check in",
    "guest pass",
  ],
  golf: [
    "golf",
    "range",
    "lesson",
    "prospect",
    "instruction",
    "tee time",
  ],
  mod_emergency: [
    "emergency",
    "911",
    "hazard",
    "unsafe",
    "medical",
    "equipment",
    "weather",
    "incident",
  ],
};

export type IngestedPolicyDraft = {
  title: string;
  department?: string | null;
  scenarioFamilies?: string[] | null;
  content: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/\r/g, "")
    .trim();
}

function cleanHeading(value: string) {
  return value
    .trim()
    .replace(/^\d+[\).\s-]+/, "")
    .replace(/:$/, "")
    .trim();
}

function isLikelyHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 90) return false;
  if (/^\d+[\).\s-]+/.test(trimmed)) return true;
  if (/:$/.test(trimmed) && trimmed.split(/\s+/).length <= 10) return true;
  if (/^[A-Z0-9\s/&()-]+$/.test(trimmed) && /[A-Z]/.test(trimmed)) return true;

  const words = trimmed.split(/\s+/);
  return words.length > 0
    && words.length <= 8
    && words.every((word) => /^[A-Z][a-z]+(?:['/-][A-Za-z]+)?$/.test(word) || /^[A-Z]{2,}$/.test(word));
}

function splitParagraphs(content: string) {
  return content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function fallbackSections(content: string) {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length <= 2) {
    return [{ title: "Core Policy Guidance", content: paragraphs.join("\n\n") || content.trim() }];
  }

  const sections: Array<{ title: string; content: string }> = [];
  for (let index = 0; index < paragraphs.length; index += 2) {
    const block = paragraphs.slice(index, index + 2).join("\n\n");
    sections.push({
      title: `Policy Section ${sections.length + 1}`,
      content: block,
    });
  }
  return sections;
}

function extractSections(content: string) {
  const lines = content.replace(/\r/g, "").split("\n");
  const sections: Array<{ title: string; content: string }> = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join("\n").trim();
    if (!body) return;
    sections.push({
      title: currentTitle || `Policy Section ${sections.length + 1}`,
      content: body,
    });
    currentTitle = "";
    currentLines = [];
  };

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      flush();
      currentTitle = cleanHeading(line);
      continue;
    }
    currentLines.push(line);
  }
  flush();

  const filtered = sections.filter((section) => section.content.length >= 80);
  return filtered.length > 0 ? filtered : fallbackSections(content);
}

function scoreByKeywords(text: string, keywords: string[]) {
  const haystack = normalizeText(text);
  return keywords.reduce((score, keyword) => score + (haystack.includes(keyword) ? 1 : 0), 0);
}

function inferDepartment(text: string, preferredDepartment?: string) {
  if (preferredDepartment) return preferredDepartment;

  const scores = Object.entries(DEPARTMENT_KEYWORDS)
    .map(([department, keywords]) => ({
      department,
      score: scoreByKeywords(text, keywords),
    }))
    .sort((a, b) => b.score - a.score);

  return scores[0]?.score ? scores[0].department : null;
}

function inferScenarioFamilies(text: string, department?: string | null) {
  const candidates = Object.entries(FAMILY_KEYWORDS)
    .map(([family, keywords]) => ({
      family,
      score: scoreByKeywords(text, keywords) + (familyLabels[family]?.toLowerCase() && normalizeText(text).includes(familyLabels[family].toLowerCase()) ? 2 : 0),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const selected = candidates
    .filter((entry, index) => index === 0 || entry.score >= Math.max(1, candidates[0].score - 1))
    .map((entry) => entry.family);

  if (selected.length === 0) return null;

  if (!department) return normalizePolicyScenarioFamilies(selected);

  const departmentPrefix = Object.entries(departmentLabels).find(([key]) => key === department)?.[0];
  if (!departmentPrefix) return normalizePolicyScenarioFamilies(selected);

  return normalizePolicyScenarioFamilies(
    selected.filter((family) => {
      if (department === "customer_service") {
        return [
          "billing_confusion",
          "cancellation_request",
          "reservation_issue",
          "upset_parent",
          "membership_question",
          "member_complaint",
        ].includes(family);
      }
      if (department === "golf") {
        return [
          "hesitant_prospect",
          "lesson_inquiry",
          "range_complaint",
          "refund_credit_request",
          "value_explanation",
        ].includes(family);
      }
      if (department === "mod_emergency") {
        return [
          "slippery_entry_complaint",
          "power_interruption_confusion",
          "unsafe_equipment_report",
          "weather_range_incident",
          "emergency_response",
        ].includes(family);
      }
      return true;
    }),
  );
}

function buildSectionTitle(sectionTitle: string, sourceTitle?: string) {
  const cleaned = cleanHeading(sectionTitle);
  if (cleaned && !/^policy section \d+$/i.test(cleaned)) return cleaned;
  if (sourceTitle) return `${sourceTitle} - ${cleaned || "Imported Policy"}`;
  return cleaned || "Imported Policy";
}

export function ingestPolicyDocument(params: {
  sourceTitle?: string;
  department?: string | null;
  content: string;
}) {
  const rawContent = params.content.trim();
  if (!rawContent) return [];

  const documentDepartment = inferDepartment(rawContent, params.department ?? undefined);
  const sections = extractSections(rawContent);

  return sections.map((section) => {
    const sectionDepartment = inferDepartment(`${section.title}\n${section.content}`, documentDepartment ?? undefined);
    return {
      title: buildSectionTitle(section.title, params.sourceTitle),
      department: sectionDepartment,
      scenarioFamilies: inferScenarioFamilies(`${section.title}\n${section.content}`, sectionDepartment),
      content: section.content.trim(),
    } satisfies IngestedPolicyDraft;
  }).filter((section) => section.content.length >= 40);
}
