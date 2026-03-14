# Customer Simulation Engine

## Purpose
The employee simulator needs to behave like a person with memory, tolerance, priorities, and imperfect communication, not a turn-by-turn script. The simulation engine separates scenario facts, persona, dynamic state, employee utterance analysis, response generation, and evaluation hooks so each layer can evolve without destabilizing the rest of the app.

## Architecture

### A. Scenario Facts
Scenario facts stay inside the scenario card.
They define:
- what happened
- what the customer wants fixed or clarified
- hidden facts
- safe resolution paths
- critical errors
- recommended turn length

### B. Customer Persona
Persona is stable across the session.
It defines:
- communication style
- starting emotion
- patience tendency
- context around membership or prospect status

### C. Dynamic Conversational State
Dynamic state changes every turn.
It tracks:
- `customer_goal`
- `goal_status`
- `emotion_state`
- `trust_level`
- `patience_level`
- `urgency_level`
- `cooperation_level`
- `offense_level`
- `manager_request_level`
- `resolution_confidence`
- `customer_strategy`
- `conversation_stage`
- `latest_employee_analysis`

### D. Employee Utterance Analysis
Each employee turn is analyzed before any customer reply is generated.
Signals include:
- respectfulness
- empathy
- clarity
- ownership
- confidence
- helpfulness
- accuracy
- directness
- explanation quality
- next-step quality
- explicit behaviors such as verification, discovery, direction, recommendation, timeline, and manager mention

This is the bridge between what the employee said and how the customer should react.

### E. Response Generation
The engine responds using:
- the current customer state
- what changed this turn
- which objective is still missing
- whether the employee sounded respectful and competent
- whether the issue actually moved forward

The customer does not merely answer the employee. The customer reacts as a person in the situation.

### F. Scoring and Logging Hooks
The conversation state is stored separately from evaluation outputs.
That lets the app:
- replay the interaction
- inspect why the customer changed tone
- score the employee later without baking scoring into the customer reply itself

## Folder Structure

```text
server/services/simulation/
  analysis.ts       # Employee utterance analysis
  engine.ts         # State update + response generation orchestration
  goals.ts          # Scenario goals and missing-objective logic
  personas.ts       # Default persona tuning helpers
  types.ts          # Shared simulator types
```

## Turn Pipeline
1. Parse scenario, transcript, and prior state.
2. Analyze the newest employee utterance.
3. Combine prior employee behavior with the newest turn.
4. Compute objective progress.
5. Update internal customer state.
6. Generate the customer reply from the updated state.
7. Persist transcript, turn state, and evaluation hooks.

## Emotional Rules
- Respectful clarity increases trust.
- Ownership lowers defensiveness.
- Deflection lowers trust and patience.
- Disrespect spikes offense and manager demand.
- In emergencies, lack of control increases urgency faster than normal service frustration.
- In golf/sales, pitching before discovery reduces cooperation.

## Prompt Strategy For LLM Mode
When an external model is available, the deterministic engine still runs first to build prompt context.
The prompt receives:
- scenario facts
- current internal state
- transcript
- employee-analysis summary
- completed objectives
- missing objective
- hidden fact status

That keeps the LLM grounded in state instead of letting it drift into generic chatbot behavior.

## Fallback Strategy
If the provider is unavailable or returns malformed output, the deterministic simulation engine produces the turn directly.
That keeps the app usable in local development, Vercel previews, and degraded runtime conditions.

## Tuning Surface
The main tuning points are:
- regex/heuristic thresholds in `analysis.ts`
- objective lists in `goals.ts`
- state transition math in `engine.ts`
- persona defaults in `personas.ts`

Those values can be adjusted without rewriting the API contract or the UI.
