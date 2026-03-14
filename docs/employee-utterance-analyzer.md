# Employee Utterance Analyzer

## Purpose
The analyzer scores not just the words an employee says, but the service quality and interpersonal impact of that turn. It is designed to feed the customer emotional update engine, not to act as a generic sentiment classifier.

## Architecture

### 1. Heuristic Rubric Layer
The first pass uses lightweight production-safe rules:
- tone phrase detection
- ownership / expectation-setting / verification / explanation signals
- disrespect, blame, dead-end, vagueness, and robotic phrasing detection
- scenario-aware policy misuse rules

This layer is fast, deterministic, and always available.

### 2. Structured Analyzer Output
The analyzer produces:
- numeric scores for service quality
- boolean flags for concrete behaviors and problems
- summary strings for prompt use
- strengths and issues arrays for simulation and coaching

### 3. Optional LLM Assistance
When higher nuance is needed, the heuristic output can be sent to an LLM as context.
The LLM is used as a refinement layer, not the primary source of truth.

Helper functions:
- `buildUtteranceAnalysisPromptPayload(...)`
- `mergeLlmAssistedAnalysis(...)`

## Scoring Logic
Scores are `0-10`.

Main quality scores:
- `clarity`
- `politeness`
- `warmth`
- `confidence`
- `respectfulness`
- `empathy`
- `professionalism`
- `accuracy`
- `accuracyConfidence`
- `ownership`
- `helpfulness`
- `directness`
- `explanationQuality`
- `nextStepQuality`
- `escalationJudgment`

Impact scores:
- `respectImpact`
- `heardImpact`

Boolean service decisions:
- `answeredQuestion`
- `avoidedQuestion`
- `soundedDismissive`
- `soundedRude`
- `setExpectationsClearly`
- `tookOwnership`
- `escalatedAppropriately`
- `madeCustomerFeelHeard`

Boolean issue flags:
- `contradictionDetected`
- `vaguenessDetected`
- `fakeConfidence`
- `blameShifting`
- `policyMisuse`
- `overTalking`
- `deadEndLanguage`
- `disrespect`
- `passiveAggression`
- `roboticPhrasing`

## Thresholds That Affect Customer Reaction
Defined in:
- `ANALYZER_REACTION_THRESHOLDS`

Current defaults:
- `feelHeardMin = 6`
- `trustGainMin = 7`
- `frustrationIncreaseMaxHelpfulness = 4`
- `escalationRiskMin = 7`
- `leaveRiskMinRespect = 3`
- `competenceGainMin = 6`

## Example Outputs

### Good
Employee:
> I can see why that would be frustrating. I am pulling up your ledger now to verify which charge is pending and which one is final, and I will give you the correction before you leave.

Likely result:
- high clarity
- high empathy
- ownership true
- answeredQuestion true
- setExpectationsClearly true
- madeCustomerFeelHeard true

### Average
Employee:
> I understand. We will look into it and get back to you.

Likely result:
- decent politeness
- low specificity
- vaguenessDetected true
- answeredQuestion false
- avoidedQuestion true

### Weak
Employee:
> I don't know. You'll need to talk to someone else.

Likely result:
- deadEndLanguage true
- tookOwnership false
- helpfulness low
- avoidedQuestion true

### Bad
Employee:
> Calm down. That's your fault, not ours.

Likely result:
- soundedDismissive true
- soundedRude true
- blameShifting true
- disrespect true
- respectfulness very low

### Emergency-Control Good
Employee:
> I am taking control now. Stay with them if it is safe, keep the area clear, and wave emergency response to cardio.

Likely result:
- professionalism high
- explicitDirection true
- explicitSafetyControl true
- escalationJudgment high
