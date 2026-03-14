import { describe, expect, it } from "vitest";
import {
  buildSampleHarnessMatrix,
  replayScenarioVariant,
  runHarnessMatrix,
} from "./harness";

describe("customer simulation harness", () => {
  it("replays a scenario variant and captures turn-by-turn state deltas", () => {
    const matrix = buildSampleHarnessMatrix();
    const result = replayScenarioVariant({
      scenarioCase: matrix[0],
      variant: matrix[0].variants[0],
    });

    expect(result.turns.length).toBeGreaterThan(0);
    expect(result.turns[0].turnNumber).toBe(1);
    expect(result.turns[0].customerReply.length).toBeGreaterThan(0);
    expect(result.turns[0].trustLevel).toBeGreaterThanOrEqual(0);
    expect(result.turns[0].frustrationEstimate).toBeGreaterThanOrEqual(0);
    expect(result.finalTranscript.length).toBeGreaterThan(result.turns.length);
  });

  it("shows better trust and lower manager pressure for good service than rude service", () => {
    const matrix = buildSampleHarnessMatrix();
    const scenarioCase = matrix[0];
    const good = replayScenarioVariant({
      scenarioCase,
      variant: scenarioCase.variants.find((variant) => variant.id === "good-response")!,
    });
    const rude = replayScenarioVariant({
      scenarioCase,
      variant: scenarioCase.variants.find((variant) => variant.id === "rude-response")!,
    });

    expect(good.finalState.trust_level).toBeGreaterThan(rude.finalState.trust_level);
    expect(good.finalState.manager_request_level).toBeLessThan(rude.finalState.manager_request_level);
    expect(good.evaluation.overallScore).toBeGreaterThanOrEqual(rude.evaluation.overallScore);
  });

  it("keeps empathetic but unresolved service unresolved while avoiding severe escalation", () => {
    const matrix = buildSampleHarnessMatrix();
    const scenarioCase = matrix[0];
    const empathetic = replayScenarioVariant({
      scenarioCase,
      variant: scenarioCase.variants.find((variant) => variant.id === "empathetic-unresolved-response")!,
    });
    const weak = replayScenarioVariant({
      scenarioCase,
      variant: scenarioCase.variants.find((variant) => variant.id === "weak-response")!,
    });

    expect(empathetic.finalState.goal_status).not.toBe("RESOLVED");
    expect(empathetic.finalState.manager_request_level).toBeLessThanOrEqual(weak.finalState.manager_request_level);
    expect(empathetic.finalState.trust_level).toBeGreaterThanOrEqual(weak.finalState.trust_level);
  });

  it("treats incorrect policy responses as a realism risk", () => {
    const matrix = buildSampleHarnessMatrix();
    const scenarioCase = matrix[0];
    const incorrectPolicy = replayScenarioVariant({
      scenarioCase,
      variant: scenarioCase.variants.find((variant) => variant.id === "incorrect-policy-response")!,
    });

    expect(incorrectPolicy.turns.some((turn) => turn.serviceFailureLevel === "severe" || turn.serviceFailureLevel === "moderate")).toBe(true);
    expect(
      incorrectPolicy.evaluation.flags.some((flag) => flag.toLowerCase().includes("severe failure path"))
      || incorrectPolicy.finalState.trust_level <= 5,
    ).toBe(true);
  });

  it("produces distinct customer paths across the default matrix to catch scripted behavior", () => {
    const dashboard = runHarnessMatrix();
    const firstScenario = dashboard.cases[0];
    const firstReplies = firstScenario.results.map((result) => result.turns[0]?.customerReply);
    const uniqueFirstReplies = new Set(firstReplies.filter(Boolean));

    expect(uniqueFirstReplies.size).toBeGreaterThanOrEqual(4);
    expect(dashboard.summary.variantsRun).toBeGreaterThanOrEqual(10);
  });
});
