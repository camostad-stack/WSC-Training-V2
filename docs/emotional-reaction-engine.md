# Emotional Reaction Engine

## Purpose
The emotional reaction engine updates the AI customer after every employee turn so the customer behaves like a person, not a script.

Inputs:
- customer persona
- current customer state
- scenario facts
- employee utterance analysis
- recent conversation history

Outputs:
- updated customer state
- emotional shift explanation
- likely next customer behavior
- response strategy for the next generated line

## Design
The engine is split into:
- `personas.ts`
  - converts communication style and patience labels into reaction modifiers
- `analysis.ts`
  - scores the employee turn for clarity, empathy, disrespect, ownership, fake confidence, blame shifting, vagueness, and more
- `emotion.ts`
  - applies thresholds and persona modifiers to produce believable state changes
- `engine.ts`
  - combines goal progress and emotional reaction into the next customer reply

## Main rules
- emotional shifts are incremental by default
- disrespect and blame shifting create stronger jumps
- repeated weak answers compound frustration and disengagement
- taking ownership and setting a clear next step increase trust
- fake confidence lowers trust faster than ordinary uncertainty
- contradictions increase confusion
- some personas ask for a manager early
- some personas go quiet or withdraw before escalating

## Thresholds
- `helpfulCalmMin`
  - minimum helpfulness score that can calm the customer
- `ownershipTrustMin`
  - minimum ownership score that adds trust
- `fakeConfidencePenaltyMaxAccuracy`
  - if accuracy is at or below this and confidence is still high, trust drops
- `disrespectEscalationMin`
  - offense level where escalation becomes likely
- `managerRequestTrustMax`
  - low-trust threshold where a rude or fake-confident answer starts pushing manager requests
- `disengageHelpfulnessMax`
  - low helpfulness threshold where the customer starts checking out
- `disengageRepeatWeakTurns`
  - number of repeated weak turns before disengagement compounds

## Example behavior
- Clear ownership:
  - customer becomes calmer
  - trust rises
  - next move is a concrete follow-up question
- Vague repeated reassurance:
  - cooperation drops
  - confusion rises
  - likely next behavior becomes caution or disengagement
- Disrespect:
  - offense rises sharply
  - manager request pressure rises
  - next strategy becomes dignity protection or manager request
- Contradiction:
  - confusion rises
  - trust drops
  - customer asks for clarification instead of moving forward
