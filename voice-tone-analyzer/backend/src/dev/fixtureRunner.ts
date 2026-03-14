import assert from "node:assert/strict";
import { analyzeRawAudio } from "../utils/features";

type FixtureSpec = {
  name: string;
  transcript?: string;
  expected: {
    rushedRisk?: "low" | "medium" | "high";
    hesitationRisk?: "low" | "medium" | "high";
    sharpnessRisk?: "low" | "medium" | "high";
    fragmentationRisk?: "low" | "medium" | "high";
  };
  samples: Float32Array;
  sampleRate: number;
};

const SAMPLE_RATE = 16000;

function concatParts(parts: Float32Array[]): Float32Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function silence(ms: number): Float32Array {
  return new Float32Array(Math.round((SAMPLE_RATE * ms) / 1000));
}

function voicedBurst(ms: number, amplitude = 0.18, frequency = 190, edge = 0.02): Float32Array {
  const length = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.sin(Math.PI * Math.min(1, i / Math.max(1, length - 1)));
    const base = Math.sin(2 * Math.PI * frequency * t);
    const harmonic = Math.sin(2 * Math.PI * (frequency * 2.6) * t) * edge;
    out[i] = (base + harmonic) * amplitude * envelope;
  }
  return out;
}

function sharpBurst(ms: number, amplitude = 0.32, frequency = 720): Float32Array {
  const length = Math.round((SAMPLE_RATE * ms) / 1000);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const envelope = Math.sin(Math.PI * Math.min(1, i / Math.max(1, length - 1)));
    const squareish = Math.sign(Math.sin(2 * Math.PI * frequency * t)) * 0.65;
    const high = Math.sin(2 * Math.PI * (frequency * 3.2) * t) * 0.35;
    const grit = Math.sin(2 * Math.PI * (frequency * 5.1) * t) * 0.18;
    out[i] = (squareish + high + grit) * amplitude * envelope;
  }
  return out;
}

function buildPattern(pattern: Array<{ burst?: [number, number?, number?, number?]; sharp?: [number, number?, number?]; silence?: number }>) {
  const parts = pattern.map((item) => {
    if (item.silence) return silence(item.silence);
    if (item.sharp) {
      const [ms, amp = 0.32, freq = 720] = item.sharp;
      return sharpBurst(ms, amp, freq);
    }
    const [ms, amp = 0.18, freq = 190, edge = 0.02] = item.burst!;
    return voicedBurst(ms, amp, freq, edge);
  });
  return concatParts(parts);
}

const fixtures: FixtureSpec[] = [
  {
    name: "calm-clear-speech",
    transcript: "Absolutely. I can check that and update you.",
    expected: {
      rushedRisk: "low",
      hesitationRisk: "low",
      fragmentationRisk: "low",
    },
    sampleRate: SAMPLE_RATE,
    samples: buildPattern([
      { burst: [520, 0.18, 185, 0.02] },
      { silence: 210 },
      { burst: [610, 0.17, 190, 0.02] },
      { silence: 240 },
      { burst: [580, 0.18, 182, 0.02] },
      { silence: 260 },
      { burst: [540, 0.17, 188, 0.02] },
    ]),
  },
  {
    name: "rushed-speech",
    transcript: "Yeah I can do that for you right now let me just pull it up and get through it quickly.",
    expected: {
      rushedRisk: "high",
      fragmentationRisk: "high",
    },
    sampleRate: SAMPLE_RATE,
    samples: buildPattern([
      { burst: [170, 0.2, 210, 0.03] },
      { silence: 70 },
      { burst: [190, 0.21, 215, 0.03] },
      { silence: 60 },
      { burst: [160, 0.2, 220, 0.03] },
      { silence: 65 },
      { burst: [180, 0.21, 210, 0.03] },
      { silence: 55 },
      { burst: [170, 0.2, 205, 0.03] },
      { silence: 60 },
      { burst: [190, 0.2, 218, 0.03] },
    ]),
  },
  {
    name: "hesitant-speech",
    transcript: "Um I think I can help with that, sorry, let me check the account first.",
    expected: {
      hesitationRisk: "high",
      fragmentationRisk: "high",
    },
    sampleRate: SAMPLE_RATE,
    samples: buildPattern([
      { burst: [210, 0.14, 180, 0.02] },
      { silence: 760 },
      { burst: [250, 0.14, 185, 0.02] },
      { silence: 980 },
      { burst: [360, 0.15, 190, 0.02] },
      { silence: 620 },
      { burst: [420, 0.16, 185, 0.02] },
    ]),
  },
  {
    name: "fragmented-speech",
    transcript: "I can, I can check that, sorry, no, let me restart and pull the right screen.",
    expected: {
      fragmentationRisk: "high",
      hesitationRisk: "high",
    },
    sampleRate: SAMPLE_RATE,
    samples: buildPattern([
      { burst: [120, 0.16, 190, 0.02] },
      { silence: 140 },
      { burst: [110, 0.16, 190, 0.02] },
      { silence: 190 },
      { burst: [140, 0.17, 200, 0.02] },
      { silence: 110 },
      { burst: [130, 0.16, 198, 0.02] },
      { silence: 260 },
      { burst: [170, 0.17, 205, 0.02] },
      { silence: 130 },
      { burst: [145, 0.17, 202, 0.02] },
      { silence: 220 },
      { burst: [220, 0.18, 198, 0.02] },
    ]),
  },
  {
    name: "sharp-intense-speech",
    transcript: "No, that is the rule and that is what we are doing.",
    expected: {
      sharpnessRisk: "high",
    },
    sampleRate: SAMPLE_RATE,
    samples: buildPattern([
      { sharp: [300, 0.34, 760] },
      { silence: 120 },
      { sharp: [340, 0.35, 780] },
      { silence: 110 },
      { sharp: [280, 0.33, 740] },
    ]),
  },
];

function run() {
  const results = fixtures.map((fixture) => {
    const analysis = analyzeRawAudio(fixture.samples, fixture.sampleRate, fixture.transcript);
    return { fixture, analysis };
  });

  for (const { fixture, analysis } of results) {
    if (fixture.expected.rushedRisk) {
      assert.equal(analysis.delivery.rushedRisk, fixture.expected.rushedRisk, `${fixture.name}: rushedRisk`);
    }
    if (fixture.expected.hesitationRisk) {
      assert.equal(analysis.pacing.hesitationRisk, fixture.expected.hesitationRisk, `${fixture.name}: hesitationRisk`);
    }
    if (fixture.expected.sharpnessRisk) {
      assert.equal(analysis.delivery.sharpnessRisk, fixture.expected.sharpnessRisk, `${fixture.name}: sharpnessRisk`);
    }
    if (fixture.expected.fragmentationRisk) {
      assert.equal(analysis.diagnostics?.fragmentationRisk, fixture.expected.fragmentationRisk, `${fixture.name}: fragmentationRisk`);
    }
  }

  console.log("Voice analyzer fixture results");
  console.table(
    results.map(({ fixture, analysis }) => ({
      fixture: fixture.name,
      rushed: analysis.delivery.rushedRisk,
      hesitant: analysis.pacing.hesitationRisk,
      sharp: analysis.delivery.sharpnessRisk,
      fragmented: analysis.diagnostics?.fragmentationRisk,
      pacing: analysis.diagnostics?.pacingStabilityRisk,
      disfluency: analysis.diagnostics?.disfluencyRisk,
      coaching: analysis.coachingSignals.join(" | "),
    }))
  );
}

run();
