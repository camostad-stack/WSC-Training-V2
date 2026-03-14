import {
  AudioAnalysisResult,
  DecodedAudio,
  IntensityLevel,
  LoudnessConsistency,
  RiskLevel,
} from "../types";

type TranscriptFusionSignals = {
  fillerDensity: number;
  restartCount: number;
  selfCorrectionCount: number;
  incompleteSentenceRisk: RiskLevel;
  disfluencyRiskScore: number;
};

type ExtractedRawFeatures = {
  sampleRate: number;
  durationSec: number;
  rmsDb: number;
  peakDb: number;
  dynamicRangeDb: number;
  estimatedSpeechRateWpm: number | null;
  voicedRatio: number;
  avgPauseMs: number;
  longPauseCount: number;
  zeroCrossingRate: number;
  spectralCentroidMean: number;
  voicedFrameCount: number;
  silentFrameCount: number;
  avgFrameEnergy: number;
  energyVariance: number;
  burstCount: number;
  burstRatePerMinute: number;
  shortBurstRatio: number;
  avgBurstMs: number;
  pauseVariability: number;
  pacingInstability: number;
  restartLikeBurstCount: number;
  energyInstability: number;
  transcriptFusion?: TranscriptFusionSignals;
};

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return mean(values.map((v) => (v - m) ** 2));
}

function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

function max(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function min(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function rms(values: number[]): number {
  if (!values.length) return 0;
  const power = mean(values.map((v) => v * v));
  return Math.sqrt(power);
}

function linearToDb(value: number): number {
  if (value <= 1e-12) return -120;
  return 20 * Math.log10(value);
}

function clamp(value: number, minValue = 0, maxValue = 10): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

function toRiskLevel(score: number): RiskLevel {
  if (score >= 6.5) return "high";
  if (score >= 3.5) return "medium";
  return "low";
}

function computeZeroCrossingRate(frame: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < frame.length; i++) {
    if (
      (frame[i - 1] >= 0 && frame[i] < 0) ||
      (frame[i - 1] < 0 && frame[i] >= 0)
    ) {
      crossings++;
    }
  }
  return crossings / Math.max(1, frame.length);
}

function computeSpectralCentroid(frame: Float32Array, sampleRate: number): number {
  const N = frame.length;
  const bins = Math.floor(N / 2);
  let weighted = 0;
  let total = 0;

  for (let k = 0; k < bins; k++) {
    let real = 0;
    let imag = 0;

    for (let n = 0; n < N; n++) {
      const angle = (-2 * Math.PI * k * n) / N;
      real += frame[n] * Math.cos(angle);
      imag += frame[n] * Math.sin(angle);
    }

    const mag = Math.sqrt(real * real + imag * imag);
    const freq = (k * sampleRate) / N;
    weighted += freq * mag;
    total += mag;
  }

  return total > 0 ? weighted / total : 0;
}

function frameAudio(samples: Float32Array, frameSize: number, hopSize: number): Float32Array[] {
  const frames: Float32Array[] = [];

  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    frames.push(samples.subarray(start, start + frameSize));
  }

  return frames;
}

function splitTranscriptWords(transcript: string): string[] {
  return transcript
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function analyzeTranscriptFusion(transcript?: string): TranscriptFusionSignals | undefined {
  if (!transcript || !transcript.trim()) return undefined;

  const words = splitTranscriptWords(transcript);
  if (!words.length) return undefined;

  const fillerTerms = new Set([
    "um",
    "uh",
    "erm",
    "ah",
    "like",
    "hmm",
  ]);

  let fillerCount = 0;
  let restartCount = 0;
  let selfCorrectionCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];

    if (fillerTerms.has(word)) fillerCount++;
    if (next && word === next) restartCount++;

    if (
      (word === "sorry" && next === "i") ||
      (word === "i" && next === "mean") ||
      (word === "no" && next === "sorry") ||
      (word === "actually") ||
      (word === "rather")
    ) {
      selfCorrectionCount++;
    }
  }

  const lower = transcript.toLowerCase().trim();
  const endsAbruptly = /\b(and|but|so|because|if|when|then|well|um|uh)$/i.test(lower);
  const punctuationFragmentSignals = (transcript.match(/(\.\.\.|--|—)/g) || []).length;
  const incompleteSentenceScore = clamp(
    (endsAbruptly ? 5 : 0) +
      (punctuationFragmentSignals * 1.8) +
      (restartCount * 0.8) +
      (selfCorrectionCount * 0.8),
    0,
    10
  );

  const fillerDensity = fillerCount / words.length;
  const disfluencyRiskScore = clamp(
    (fillerDensity * 30) + restartCount + (selfCorrectionCount * 1.3) + (incompleteSentenceScore * 0.6),
    0,
    10
  );

  return {
    fillerDensity: Number(fillerDensity.toFixed(3)),
    restartCount,
    selfCorrectionCount,
    incompleteSentenceRisk: toRiskLevel(incompleteSentenceScore),
    disfluencyRiskScore,
  };
}

function estimateWordsPerMinute(
  transcript: string | undefined,
  durationSec: number,
  voicedDurationSec: number,
  burstCount: number,
  restartLikeBurstCount: number
): number | null {
  if (durationSec < 1.2) return null;

  if (transcript && transcript.trim()) {
    const wordCount = splitTranscriptWords(transcript).length;
    if (!wordCount) return null;
    const speechWindowSec = Math.max(0.8, durationSec);
    return Math.round((wordCount / speechWindowSec) * 60);
  }

  const proxyWords = Math.max(1, Math.round((burstCount * 1.6) + (restartLikeBurstCount * 0.4)));
  return Math.round((proxyWords / Math.max(0.8, voicedDurationSec)) * 60);
}

function classifyLoudnessConsistency(energyInstability: number): LoudnessConsistency {
  if (energyInstability < 0.35) return "stable";
  if (energyInstability < 0.8) return "variable";
  return "erratic";
}

function classifyIntensity(rmsDb: number): IntensityLevel {
  if (rmsDb < -31) return "low";
  if (rmsDb < -20) return "moderate";
  return "high";
}

function collectBurstAndPauseStats(voicedFlags: boolean[], hopMs: number) {
  const bursts: number[] = [];
  const pauses: number[] = [];

  let runLength = 0;
  let currentType: "voiced" | "silent" | null = null;

  const flush = () => {
    if (runLength === 0 || currentType === null) return;
    const duration = runLength * hopMs;
    if (currentType === "voiced") {
      bursts.push(duration);
    } else {
      pauses.push(duration);
    }
    runLength = 0;
  };

  for (const voiced of voicedFlags) {
    const nextType: "voiced" | "silent" = voiced ? "voiced" : "silent";
    if (currentType === null) {
      currentType = nextType;
      runLength = 1;
      continue;
    }

    if (currentType === nextType) {
      runLength++;
      continue;
    }

    flush();
    currentType = nextType;
    runLength = 1;
  }

  flush();

  if (!voicedFlags[0] && pauses.length) pauses.shift();
  if (!voicedFlags[voicedFlags.length - 1] && pauses.length) pauses.pop();

  return { bursts, pauses };
}

function extractRawFeatures(
  samples: Float32Array,
  sampleRate: number,
  transcript?: string
): ExtractedRawFeatures {
  const durationSec = samples.length / sampleRate;
  const sampleArray = Array.from(samples);

  const totalRms = rms(sampleArray);
  const peak = max(sampleArray.map((x) => Math.abs(x)));
  const rmsDb = linearToDb(totalRms);
  const peakDb = linearToDb(peak);

  const frameMs = 25;
  const hopMs = 10;
  const frameSize = Math.max(1, Math.floor((sampleRate * frameMs) / 1000));
  const hopSize = Math.max(1, Math.floor((sampleRate * hopMs) / 1000));
  const frames = frameAudio(samples, frameSize, hopSize);

  const frameEnergies: number[] = [];
  const zcrs: number[] = [];
  const centroids: number[] = [];

  for (const frame of frames) {
    const arr = Array.from(frame);
    frameEnergies.push(rms(arr));
    zcrs.push(computeZeroCrossingRate(frame));
    centroids.push(computeSpectralCentroid(frame, sampleRate));
  }

  const sortedEnergies = [...frameEnergies].sort((a, b) => a - b);
  const noiseFloor = sortedEnergies.length ? sortedEnergies[Math.floor(sortedEnergies.length * 0.15)] : 0;
  const medianEnergy = sortedEnergies.length ? sortedEnergies[Math.floor(sortedEnergies.length * 0.5)] : 0;
  const voicedThreshold = Math.max(0.006, noiseFloor * 1.6, medianEnergy * 0.62);

  const voicedFlags = frameEnergies.map((energy) => energy > voicedThreshold);
  const voicedFrameCount = voicedFlags.filter(Boolean).length;
  const silentFrameCount = voicedFlags.length - voicedFrameCount;
  const voicedRatio = voicedFlags.length ? voicedFrameCount / voicedFlags.length : 0;

  const { bursts, pauses } = collectBurstAndPauseStats(voicedFlags, hopMs);
  const burstCount = bursts.length;
  const voicedDurationSec = bursts.reduce((sum, duration) => sum + duration, 0) / 1000;
  const avgPauseMs = pauses.length ? mean(pauses) : 0;
  const longPauseCount = pauses.filter((pause) => pause >= 900).length;
  const pauseVariability = pauses.length >= 2 ? stddev(pauses) / Math.max(120, mean(pauses)) : 0;
  const avgBurstMs = bursts.length ? mean(bursts) : 0;
  const shortBurstCount = bursts.filter((burst) => burst <= 260).length;
  const shortBurstRatio = bursts.length ? shortBurstCount / bursts.length : 0;
  const burstRatePerMinute = durationSec > 0 ? (burstCount / durationSec) * 60 : 0;
  const restartLikeBurstCount = bursts.filter((burst, index) => {
    const nextPause = pauses[index] ?? 9999;
    return burst <= 220 && nextPause <= 280;
  }).length;

  const energyVar = variance(frameEnergies);
  const energyInstability = frameEnergies.length
    ? stddev(frameEnergies) / Math.max(1e-6, mean(frameEnergies))
    : 0;
  const pacingInstability = clamp(
    (pauseVariability * 5) + (shortBurstRatio * 4) + (restartLikeBurstCount * 0.8),
    0,
    10
  );

  const estimatedSpeechRateWpm = estimateWordsPerMinute(
    transcript,
    durationSec,
    voicedDurationSec,
    burstCount,
    restartLikeBurstCount
  );

  const transcriptFusion = analyzeTranscriptFusion(transcript);

  return {
    sampleRate,
    durationSec,
    rmsDb,
    peakDb,
    dynamicRangeDb:
      linearToDb(max(frameEnergies) || 1e-6) - linearToDb(Math.max(min(frameEnergies), 1e-6)),
    estimatedSpeechRateWpm,
    voicedRatio,
    avgPauseMs,
    longPauseCount,
    zeroCrossingRate: mean(zcrs),
    spectralCentroidMean: mean(centroids),
    voicedFrameCount,
    silentFrameCount,
    avgFrameEnergy: mean(frameEnergies),
    energyVariance: energyVar,
    burstCount,
    burstRatePerMinute,
    shortBurstRatio,
    avgBurstMs,
    pauseVariability,
    pacingInstability,
    restartLikeBurstCount,
    energyInstability,
    transcriptFusion,
  };
}

function buildCoachingSignals(
  rushedRisk: RiskLevel,
  hesitationRisk: RiskLevel,
  interruptionRisk: RiskLevel,
  sharpnessRisk: RiskLevel,
  loudnessConsistency: LoudnessConsistency,
  fragmentationRisk: RiskLevel,
  pacingStabilityRisk: RiskLevel,
  transcriptFusion?: TranscriptFusionSignals
): string[] {
  const coachingSignals: string[] = [];

  if (rushedRisk === "high") {
    coachingSignals.push("Delivery sounds rushed. Slow down and let each point land before moving to the next.");
  }

  if (hesitationRisk === "high") {
    coachingSignals.push("The turn has long pauses or restarts. Start with a clearer first sentence and commit to it.");
  }

  if (fragmentationRisk !== "low") {
    coachingSignals.push("Speech is breaking into short bursts. Try to finish one thought before starting the next.");
  }

  if (pacingStabilityRisk !== "low") {
    coachingSignals.push("Pacing feels uneven. Use more deliberate pauses instead of alternating between rushing and stopping.");
  }

  if (interruptionRisk === "high") {
    coachingSignals.push("There is very little conversational space. Leave a beat before your next point.");
  }

  if (sharpnessRisk === "high") {
    coachingSignals.push("The delivery sounds sharp or clipped. Reduce vocal edge and keep your tone steadier.");
  }

  if (loudnessConsistency === "erratic") {
    coachingSignals.push("Loudness swings are noticeable. Aim for steadier volume through the turn.");
  }

  if (transcriptFusion && transcriptFusion.fillerDensity >= 0.08) {
    coachingSignals.push("The transcript suggests filler-heavy delivery. Shorten your opening and speak more directly.");
  }

  if (transcriptFusion && transcriptFusion.restartCount >= 2) {
    coachingSignals.push("The speaker appears to restart thoughts mid-turn. Organize the answer before speaking.");
  }

  if (coachingSignals.length === 0) {
    coachingSignals.push("Delivery is reasonably stable. Keep your pace controlled and your pauses intentional.");
  }

  return coachingSignals;
}

function interpretFeatures(raw: ExtractedRawFeatures): AudioAnalysisResult {
  const loudnessConsistency = classifyLoudnessConsistency(raw.energyInstability);
  const intensity = classifyIntensity(raw.rmsDb);

  const transcriptPenalty = raw.transcriptFusion?.disfluencyRiskScore ?? 0;
  const rushedScore = clamp(
    ((raw.estimatedSpeechRateWpm ?? 0) - 150) / 14 +
      ((raw.avgPauseMs < 170) ? 2.6 : 0) +
      (raw.voicedRatio * 3.2) +
      (raw.shortBurstRatio * 5.5) +
      (raw.pacingInstability * 0.3),
    0,
    10
  );

  const hesitationScore = clamp(
    (raw.avgPauseMs / 190) +
      (raw.longPauseCount * 1.5) +
      (raw.pauseVariability * 3.5) +
      (raw.restartLikeBurstCount * 0.8) +
      (transcriptPenalty * 0.35),
    0,
    10
  );

  const interruptionScore = clamp(
    ((raw.estimatedSpeechRateWpm ?? 0) - 145) / 22 +
      (raw.voicedRatio * 3.4) +
      (raw.avgPauseMs < 140 ? 2.4 : 0) +
      (raw.shortBurstRatio * 2.2),
    0,
    10
  );

  const sharpnessScore = clamp(
    ((raw.spectralCentroidMean - 1900) / 180) +
      ((raw.peakDb - raw.rmsDb - 7) / 1.6) +
      ((raw.zeroCrossingRate - 0.06) * 30) +
      (raw.rmsDb > -18 ? 1.4 : 0) +
      (raw.shortBurstRatio * 1.8),
    0,
    10
  );

  const fragmentationScore = clamp(
    (raw.shortBurstRatio * 7) +
      (raw.burstRatePerMinute / 35) +
      (raw.pauseVariability * 2.8) +
      (raw.restartLikeBurstCount * 1.2) +
      (transcriptPenalty * 0.4),
    0,
    10
  );

  const pacingStabilityScore = clamp(
    (raw.pacingInstability * 0.9) +
      (raw.energyInstability * 2.2) +
      (Math.abs(raw.avgBurstMs - 420) / 120),
    0,
    10
  );

  const disfluencyScore = clamp(
    (raw.restartLikeBurstCount * 1.4) +
      (raw.shortBurstRatio * 4.8) +
      (transcriptPenalty * 0.7),
    0,
    10
  );

  const rushedRisk = toRiskLevel(rushedScore);
  const hesitationRisk = toRiskLevel(hesitationScore);
  const interruptionRisk = toRiskLevel(interruptionScore);
  const sharpnessRisk = toRiskLevel(sharpnessScore);
  const fragmentationRisk = toRiskLevel(fragmentationScore);
  const pacingStabilityRisk = toRiskLevel(pacingStabilityScore);
  const disfluencyRisk = toRiskLevel(disfluencyScore);

  const coachingSignals = buildCoachingSignals(
    rushedRisk,
    hesitationRisk,
    interruptionRisk,
    sharpnessRisk,
    loudnessConsistency,
    fragmentationRisk,
    pacingStabilityRisk,
    raw.transcriptFusion
  );

  return {
    audio: {
      sampleRate: raw.sampleRate,
      durationSec: Number(raw.durationSec.toFixed(2)),
      rmsDb: Number(raw.rmsDb.toFixed(2)),
      peakDb: Number(raw.peakDb.toFixed(2)),
      dynamicRangeDb: Number(raw.dynamicRangeDb.toFixed(2)),
    },
    pacing: {
      estimatedSpeechRateWpm: raw.estimatedSpeechRateWpm,
      voicedRatio: Number(raw.voicedRatio.toFixed(3)),
      avgPauseMs: Number(raw.avgPauseMs.toFixed(1)),
      longPauseCount: raw.longPauseCount,
      hesitationRisk,
    },
    delivery: {
      loudnessConsistency,
      intensity,
      interruptionRisk,
      rushedRisk,
      sharpnessRisk,
    },
    coachingSignals,
    rawFeatures: {
      zeroCrossingRate: Number(raw.zeroCrossingRate.toFixed(5)),
      spectralCentroidMean: Number(raw.spectralCentroidMean.toFixed(2)),
      voicedFrameCount: raw.voicedFrameCount,
      silentFrameCount: raw.silentFrameCount,
      avgFrameEnergy: Number(raw.avgFrameEnergy.toFixed(6)),
      energyVariance: Number(raw.energyVariance.toFixed(6)),
    },
    diagnostics: {
      fragmentationRisk,
      pacingStabilityRisk,
      disfluencyRisk,
      burstRatePerMinute: Number(raw.burstRatePerMinute.toFixed(2)),
      shortBurstRatio: Number(raw.shortBurstRatio.toFixed(3)),
      pauseVariability: Number(raw.pauseVariability.toFixed(3)),
      transcriptFusion: raw.transcriptFusion
        ? {
            fillerDensity: raw.transcriptFusion.fillerDensity,
            restartCount: raw.transcriptFusion.restartCount,
            selfCorrectionCount: raw.transcriptFusion.selfCorrectionCount,
            incompleteSentenceRisk: raw.transcriptFusion.incompleteSentenceRisk,
          }
        : undefined,
    },
  };
}

export function analyzeRawAudio(
  samples: Float32Array,
  sampleRate: number,
  transcript?: string
): AudioAnalysisResult {
  return interpretFeatures(extractRawFeatures(samples, sampleRate, transcript));
}

export function extractAcousticFeatures(
  audio: DecodedAudio,
  transcript?: string
): AudioAnalysisResult {
  return analyzeRawAudio(audio.samples, audio.sampleRate, transcript);
}
