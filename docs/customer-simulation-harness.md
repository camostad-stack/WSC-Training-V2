# Customer Simulation Harness

This harness gives us a fast way to replay realistic front desk scenarios against the current customer simulator and judge whether the customer behavior still feels believable.

## What it tests

For each scenario/employee variant pair, the harness records:

- customer emotional changes
- trust changes
- derived frustration changes
- escalation pressure
- service failure level
- repetition risk
- persona alignment
- scenario alignment

It is intentionally built around the existing simulator entry point, not a separate fork. That keeps the runtime path honest.

## Current architecture

Files:

- `/Users/coopermostad/Downloads/wsc-simulator/server/services/simulation/harness.ts`
- `/Users/coopermostad/Downloads/wsc-simulator/scripts/customer-simulation-harness.ts`

Core flow:

1. Build a scenario matrix
2. Replay employee turns through `simulateCustomerTurn(...)`
3. Capture turn-by-turn state deltas
4. Score realism heuristically
5. Print a compact report or JSON output

## Sample test matrix

The default matrix includes:

- `billing-confusion`
- `wrong-information`

Each scenario includes these employee-quality variants:

- `good-response`
- `weak-response`
- `rude-response`
- `incorrect-policy-response`
- `empathetic-unresolved-response`

## Logging dashboard structure

The harness returns:

```json
{
  "summary": {
    "scenariosRun": 2,
    "variantsRun": 10,
    "averageOverallScore": 8,
    "flaggedVariants": 2,
    "highRepetitionVariants": 1
  },
  "cases": [
    {
      "scenarioId": "billing-confusion",
      "title": "Billing confusion",
      "results": [
        {
          "variant": {
            "id": "good-response",
            "label": "Good response"
          },
          "turns": [
            {
              "turnNumber": 1,
              "trustLevel": 5,
              "trustDelta": 2,
              "frustrationEstimate": 5,
              "frustrationDelta": -1,
              "managerRequestLevel": 1,
              "serviceFailureLevel": "none",
              "likelyNextBehavior": "ask_follow_up"
            }
          ],
          "evaluation": {
            "overallScore": 9,
            "repetitionScore": 9,
            "notes": [],
            "flags": []
          }
        }
      ]
    }
  ]
}
```

## Realism evaluation criteria

The harness scores:

- `emotionalConsistency`
  - does the customer get calmer after helpful ownership?
  - does frustration rise after disrespect or repeated weak service?
- `trustConsistency`
  - does fake confidence reduce trust?
  - does clarity and ownership improve trust?
- `escalationAppropriateness`
  - does the customer ask for a manager only when the interaction earns it?
- `repetitionScore`
  - are replies being reused too often?
- `personaAlignment`
  - does the customer sound like the persona?
- `scenarioAlignment`
  - do replies stay tied to the scenario facts instead of drifting?

This is not a perfect realism oracle. It is a fast regression net so we can compare builds and tune intelligently.

## How to run it

Text report:

```bash
pnpm audit:customer-sim
```

JSON:

```bash
pnpm audit:customer-sim --json
```

## How to tune quickly

The fastest tuning loop is:

1. Adjust analyzer or emotional thresholds
2. Run `pnpm audit:customer-sim`
3. Inspect:
   - trust deltas
   - frustration changes
   - escalation pressure
   - flags
   - repetition score
4. Re-run targeted unit tests in:
   - `/Users/coopermostad/Downloads/wsc-simulator/server/services/simulation/harness.test.ts`
   - `/Users/coopermostad/Downloads/wsc-simulator/server/services/simulation/emotion.test.ts`
   - `/Users/coopermostad/Downloads/wsc-simulator/server/services/simulation/engine.test.ts`

## What counts as a regression

Examples:

- good service causes fast manager escalation
- rude service does not increase pressure or frustration
- wrong policy does not reduce trust
- empathetic but unresolved service resolves too quickly
- multiple weak turns produce identical customer replies
