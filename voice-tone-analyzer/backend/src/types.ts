export type RiskLevel = "low" | "medium" | "high";
export type LoudnessConsistency = "stable" | "variable" | "erratic";
export type IntensityLevel = "low" | "moderate" | "high";

export type DecodedAudio = {
  sampleRate: number;
  channelCount: number;
  bitDepth: number;
  samples: Float32Array;
  durationSec: number;
};

export type AudioAnalysisResult = {
  audio: {
    sampleRate: number;
    durationSec: number;
    rmsDb: number;
    peakDb: number;
    dynamicRangeDb: number;
  };
  pacing: {
    estimatedSpeechRateWpm: number | null;
    voicedRatio: number;
    avgPauseMs: number;
    longPauseCount: number;
    hesitationRisk: RiskLevel;
  };
  delivery: {
    loudnessConsistency: LoudnessConsistency;
    intensity: IntensityLevel;
    interruptionRisk: RiskLevel;
    rushedRisk: RiskLevel;
    sharpnessRisk: RiskLevel;
  };
  coachingSignals: string[];
  rawFeatures: {
    zeroCrossingRate: number;
    spectralCentroidMean: number;
    voicedFrameCount: number;
    silentFrameCount: number;
    avgFrameEnergy: number;
    energyVariance: number;
  };
  diagnostics?: {
    fragmentationRisk: RiskLevel;
    pacingStabilityRisk: RiskLevel;
    disfluencyRisk: RiskLevel;
    burstRatePerMinute: number;
    shortBurstRatio: number;
    pauseVariability: number;
    transcriptFusion?: {
      fillerDensity: number;
      restartCount: number;
      selfCorrectionCount: number;
      incompleteSentenceRisk: RiskLevel;
    };
  };
};

export type SessionTurnRecord = {
  sessionId: string;
  employeeId: string;
  turnId: string;
  createdAt: string;
  transcript?: string;
  analysis: AudioAnalysisResult;
};
