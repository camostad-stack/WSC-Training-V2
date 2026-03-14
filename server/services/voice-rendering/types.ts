export const VOICE_RENDER_PROVIDERS = [
  "openai-realtime-native",
  "openai-native-speech",
  "cartesia",
  "elevenlabs",
  "browser-native-speech",
] as const;

export type VoiceRenderProvider = (typeof VOICE_RENDER_PROVIDERS)[number];

export const VOICE_PACES = ["slow", "steady", "brisk"] as const;
export type VoicePace = (typeof VOICE_PACES)[number];

export const VOICE_WARMTHS = ["cool", "neutral", "warm"] as const;
export type VoiceWarmth = (typeof VOICE_WARMTHS)[number];

export const VOICE_SHARPNESSES = ["soft", "balanced", "edgy"] as const;
export type VoiceSharpness = (typeof VOICE_SHARPNESSES)[number];

export const VOICE_ENERGIES = ["low", "medium", "high"] as const;
export type VoiceEnergy = (typeof VOICE_ENERGIES)[number];

export const VOICE_INTERRUPTION_TENDENCIES = ["rare", "situational", "frequent"] as const;
export type VoiceInterruptionTendency = (typeof VOICE_INTERRUPTION_TENDENCIES)[number];

export const VOICE_HESITATION_TENDENCIES = ["rare", "light", "noticeable"] as const;
export type VoiceHesitationTendency = (typeof VOICE_HESITATION_TENDENCIES)[number];

export const VOICE_VERBOSITY_TENDENCIES = ["brief", "balanced", "expansive"] as const;
export type VoiceVerbosityTendency = (typeof VOICE_VERBOSITY_TENDENCIES)[number];

export const VOICE_AGE_FLAVORS = ["young_adult", "adult", "older_adult"] as const;
export type VoiceAgeFlavor = (typeof VOICE_AGE_FLAVORS)[number];

export const VOICE_EMOTIONAL_RESPONSIVENESS = ["restrained", "flexible", "volatile"] as const;
export type VoiceEmotionalResponsiveness = (typeof VOICE_EMOTIONAL_RESPONSIVENESS)[number];

export const VOICE_PERSONA_ARCHETYPES = [
  "rushed_impatient",
  "calm_skeptical",
  "polite_frustrated",
  "blunt_low_patience",
  "warm_confused",
  "suspicious_direct",
  "steady_practical",
  "anxious_cautious",
] as const;
export type VoicePersonaArchetype = (typeof VOICE_PERSONA_ARCHETYPES)[number];

export const VOICE_OPENER_CADENCES = [
  "straight-to-the-point",
  "guarded-then-direct",
  "brisk-with-pressure",
  "warm-but-uncertain",
  "skeptical-check-in",
  "frayed-and-clipped",
] as const;
export type VoiceOpenerCadence = (typeof VOICE_OPENER_CADENCES)[number];

export const VOICE_APOLOGY_RHYTHMS = [
  "rare-and-brusque",
  "quick-self-correction",
  "softened-reluctantly",
  "matter-of-fact",
  "defensive-under-breath",
] as const;
export type VoiceApologyRhythm = (typeof VOICE_APOLOGY_RHYTHMS)[number];

export const VOICE_CLOSURE_STYLES = [
  "guarded-acceptance",
  "skeptical-last-check",
  "brief-drop-off",
  "practical-sign-off",
  "relieved-but-watching",
] as const;
export type VoiceClosureStyle = (typeof VOICE_CLOSURE_STYLES)[number];

export const VOICE_EMOTIONAL_ARC_PATTERNS = [
  "spikes-before-softening",
  "flat-then-wary-trust",
  "skeptical-until-specifics",
  "frayed-then-practical",
  "warmth-lost-then-recovered",
] as const;
export type VoiceEmotionalArcPattern = (typeof VOICE_EMOTIONAL_ARC_PATTERNS)[number];

export const VOICE_STREAM_PROTOCOLS = ["http-chunked", "sse", "websocket", "native"] as const;
export type VoiceStreamProtocol = (typeof VOICE_STREAM_PROTOCOLS)[number];

export const VOICE_AUDIO_CONTAINERS = ["mp3", "wav", "pcm", "raw"] as const;
export type VoiceAudioContainer = (typeof VOICE_AUDIO_CONTAINERS)[number];

export const VOICE_AUDIO_ENCODINGS = ["mp3", "pcm_s16le", "pcm_f32le", "mulaw"] as const;
export type VoiceAudioEncoding = (typeof VOICE_AUDIO_ENCODINGS)[number];

export interface VoiceOutputFormat {
  container: VoiceAudioContainer;
  encoding?: VoiceAudioEncoding;
  sampleRateHz?: number;
  mimeType?: string;
}

export interface VoiceProfile {
  provider: VoiceRenderProvider;
  voiceId: string;
  pace: VoicePace;
  warmth: VoiceWarmth;
  sharpness: VoiceSharpness;
  energy: VoiceEnergy;
  interruptionTendency: VoiceInterruptionTendency;
  hesitationTendency: VoiceHesitationTendency;
  verbosityTendency: VoiceVerbosityTendency;
  ageFlavor: VoiceAgeFlavor;
  emotionalResponsiveness: VoiceEmotionalResponsiveness;
}

export interface NormalizedVoiceRenderConfig extends VoiceProfile {
  speechRate: number;
  pitch: number;
  stylePrompt: string;
  emotionHint: string;
  providerModel?: string;
  fallbackProviders: VoiceRenderProvider[];
  outputFormat: VoiceOutputFormat;
}

export interface VoiceProviderCapabilities {
  provider: VoiceRenderProvider;
  supportsStreaming: boolean;
  supportsEmotionControl: boolean;
  supportsSpeedControl: boolean;
  supportsStyleControl: boolean;
  supportsCustomVoices: boolean;
  supportsRealtimeNativeOutput: boolean;
  supportsWordTimestamps: boolean;
  defaultModel: string;
  supportedModels: string[];
  outputFormats: VoiceOutputFormat[];
}

export interface VoiceProviderVoice {
  provider: VoiceRenderProvider;
  voiceId: string;
  displayName: string;
  locale: string;
  ageFlavor?: VoiceAgeFlavor;
  genderFlavor?: "feminine" | "masculine" | "neutral";
  traits: string[];
  previewUrl?: string;
  custom?: boolean;
}

export interface CustomerVoiceCast extends VoiceProfile {
  sessionSeed: string;
  cadenceFingerprint: string;
  personaArchetype: VoicePersonaArchetype;
  openerCadencePattern: VoiceOpenerCadence;
  apologyRhythmPattern: VoiceApologyRhythm;
  closurePhrasingStyle: VoiceClosureStyle;
  emotionalArcPattern: VoiceEmotionalArcPattern;
  speechRate: number;
  pitch: number;
  stylePrompt: string;
  emotionHint: string;
  providerModel?: string;
  fallbackProviders: VoiceRenderProvider[];
  providerCapabilities: VoiceProviderCapabilities;
  repeatCallerKey?: string;
  preserveCallerVoice?: boolean;
  castingDiagnostics: {
    repeatCaller: boolean;
    recentVoiceUsageFrequency: number;
    recentProviderUsageFrequency: number;
    recentPersonaUsageFrequency: number;
    recentCadenceUsageFrequency: number;
    assignmentReasons: string[];
    fallbackEvents: VoiceFallbackEvent[];
  };
}

export interface VoiceSynthesisRequest {
  text: string;
  config: NormalizedVoiceRenderConfig;
  model?: string;
  format?: Partial<VoiceOutputFormat>;
  language?: string;
  metadata?: Record<string, unknown>;
  fetchFn?: typeof fetch;
}

export interface VoiceSynthesisResult {
  provider: VoiceRenderProvider;
  voiceId: string;
  model: string;
  contentType: string;
  audio: ArrayBuffer;
  didFallback: boolean;
  fallbackEvent?: VoiceFallbackEvent;
  warnings?: string[];
}

export interface VoiceStreamRequest {
  text: string;
  config: NormalizedVoiceRenderConfig;
  model?: string;
  language?: string;
  includeWordTimestamps?: boolean;
  fetchFn?: typeof fetch;
  contextId?: string;
}

export interface VoiceStreamChunk {
  type: "audio" | "timestamp" | "done" | "error";
  data?: Uint8Array;
  words?: string[];
  startsMs?: number[];
  endsMs?: number[];
  error?: string;
}

export interface VoicePreparedConnection {
  protocol: VoiceStreamProtocol;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
  query?: Record<string, string>;
}

export interface VoiceStreamResult {
  provider: VoiceRenderProvider;
  voiceId: string;
  model: string;
  protocol: VoiceStreamProtocol;
  stream?: AsyncIterable<VoiceStreamChunk>;
  connection?: VoicePreparedConnection;
  didFallback: boolean;
  fallbackEvent?: VoiceFallbackEvent;
}

export interface VoiceFallbackEvent {
  fromProvider: VoiceRenderProvider;
  toProvider: VoiceRenderProvider;
  reason: string;
  sessionSeed?: string;
  attemptedVoiceId?: string;
}

export interface VoiceRenderQualityScores {
  naturalness: number;
  phraseRepetitionRisk: number;
  emotionalRealism: number;
  interruptionRecovery: number;
}

export interface VoiceRenderDiagnostics {
  provider: VoiceRenderProvider;
  voiceId: string;
  renderMode: "synthesized" | "streamed";
  latencyMs: number;
  didFallback: boolean;
  fallbackEvent?: VoiceFallbackEvent;
  quality: VoiceRenderQualityScores;
  notes: string[];
}

export interface VoiceAbComparisonSample {
  requestedProvider: VoiceRenderProvider;
  finalProvider: VoiceRenderProvider;
  voiceId: string;
  didFallback: boolean;
  fallbackEvent?: VoiceFallbackEvent;
  diagnostics: VoiceRenderDiagnostics;
}

export interface VoiceAbComparison {
  text: string;
  baselineProvider: VoiceRenderProvider;
  samples: VoiceAbComparisonSample[];
}

export interface VoiceProviderAdapter {
  provider: VoiceRenderProvider;
  getCapabilities(): VoiceProviderCapabilities;
  listAvailableVoices(params?: { fetchFn?: typeof fetch; search?: string }): Promise<VoiceProviderVoice[]>;
  synthesizeSpeech(request: VoiceSynthesisRequest): Promise<VoiceSynthesisResult>;
  streamSpeech(request: VoiceStreamRequest): Promise<VoiceStreamResult>;
}
