import type { CustomerVoiceCast } from "@/features/simulator/types";

function splitIntoSpeechChunks(message: string) {
  return message
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreBrowserVoice(voice: SpeechSynthesisVoice, cast: CustomerVoiceCast) {
  const name = `${voice.name} ${voice.lang}`.toLowerCase();
  let score = 0;
  if (voice.lang.toLowerCase().startsWith("en-us")) score += 6;
  if (voice.lang.toLowerCase().startsWith("en")) score += 3;
  if (/natural|neural|premium|enhanced/.test(name)) score += 5;
  if (cast.warmth === "warm" && /samantha|ava|victoria|jenny|aria|zoe/.test(name)) score += 5;
  if (cast.sharpness === "edgy" && /compact|microsoft|google/.test(name)) score += 2;
  if (cast.ageFlavor === "older_adult" && /allison|victoria/.test(name)) score += 2;
  if (cast.energy === "high" && /aria|jenny|google us english/.test(name)) score += 2;
  if (/compact|espeak/.test(name)) score -= 10;
  return score;
}

export function chooseBrowserSpeechVoice(cast: CustomerVoiceCast) {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return [...voices].sort((a, b) => scoreBrowserVoice(b, cast) - scoreBrowserVoice(a, cast))[0] ?? null;
}

function base64ToUint8Array(encoded: string) {
  const binary = window.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function speakWithBrowserVoiceCast(params: {
  message: string;
  cast: CustomerVoiceCast;
  preferredVoice?: SpeechSynthesisVoice | null;
}) {
  if (typeof window === "undefined" || typeof window.speechSynthesis === "undefined") return;
  const voice = params.preferredVoice || chooseBrowserSpeechVoice(params.cast);
  const chunks = splitIntoSpeechChunks(params.message);

  for (const chunk of chunks) {
    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.rate = params.cast.speechRate;
      utterance.pitch = params.cast.pitch;
      utterance.volume = 1;
      if (voice) {
        utterance.voice = voice;
      }
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }
}

export function stopRenderedCustomerAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  audio.src = "";
}

export async function playRenderedCustomerAudio(params: {
  audioBase64: string;
  contentType: string;
  onAudioCreated?: (audio: HTMLAudioElement | null) => void;
}) {
  if (typeof window === "undefined") {
    return {
      started: false,
      completed: false,
      error: "window_unavailable",
    };
  }
  const audioBytes = base64ToUint8Array(params.audioBase64);
  const blob = new Blob([audioBytes], { type: params.contentType });
  const audioUrl = URL.createObjectURL(blob);
  const audio = new Audio(audioUrl);
  params.onAudioCreated?.(audio);
  let started = false;
  try {
    const result = await new Promise<{ started: boolean; completed: boolean; error?: string }>((resolve) => {
      audio.onended = () => resolve({ started: true, completed: true });
      audio.onerror = () => resolve({ started, completed: false, error: "audio_element_error" });
      void audio.play()
        .then(() => {
          started = true;
        })
        .catch((error) => resolve({
          started: false,
          completed: false,
          error: error instanceof Error ? error.message : "audio_play_failed",
        }));
    });
    return result;
  } finally {
    params.onAudioCreated?.(null);
    URL.revokeObjectURL(audioUrl);
  }
}
