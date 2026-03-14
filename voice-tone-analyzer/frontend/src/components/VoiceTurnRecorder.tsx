import React, { useRef, useState } from "react";

type AnalysisResponse = {
  ok: boolean;
  turnId: string;
  sessionId: string;
  employeeId: string;
  analysis: {
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
      hesitationRisk: "low" | "medium" | "high";
    };
    delivery: {
      loudnessConsistency: "stable" | "variable" | "erratic";
      intensity: "low" | "moderate" | "high";
      interruptionRisk: "low" | "medium" | "high";
      rushedRisk: "low" | "medium" | "high";
      sharpnessRisk: "low" | "medium" | "high";
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
  };
};

type Props = {
  analyzerUrl?: string;
  sessionId: string;
  employeeId: string;
};

export default function VoiceTurnRecorder({
  analyzerUrl = "http://localhost:3010",
  sessionId,
  employeeId,
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startRecording() {
    setError(null);
    setResult(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const formData = new FormData();

          formData.append("audio", blob, "turn.webm");
          formData.append("sessionId", sessionId);
          formData.append("employeeId", employeeId);

          if (transcript.trim()) {
            formData.append("transcript", transcript.trim());
          }

          const response = await fetch(`${analyzerUrl}/analyze-audio-turn`, {
            method: "POST",
            body: formData,
          });

          const json = await response.json();

          if (!response.ok) {
            throw new Error(json?.details || json?.error || "Upload failed");
          }

          setResult(json);
        } catch (err: any) {
          setError(err?.message || "Failed to analyze audio");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      setError(err?.message || "Failed to start recording");
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    recorder.stop();
    setIsRecording(false);
  }

  return (
    <div
      style={{
        maxWidth: 700,
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 12,
      }}
    >
      <h3>Voice Turn Recorder</h3>

      <div style={{ marginBottom: 12 }}>
        <label htmlFor="transcript">Optional transcript</label>
        <textarea
          id="transcript"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={4}
          style={{ width: "100%", marginTop: 8 }}
          placeholder="Optional transcript for this employee turn..."
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {!isRecording ? (
          <button onClick={startRecording}>Start Recording</button>
        ) : (
          <button onClick={stopRecording}>Stop Recording</button>
        )}
      </div>

      {error && <div style={{ color: "red", marginBottom: 16 }}>{error}</div>}

      {result && (
        <div>
          <h4>Analysis Result</h4>

          <p>
            <strong>Turn ID:</strong> {result.turnId}
          </p>
          <p>
            <strong>Duration:</strong> {result.analysis.audio.durationSec}s
          </p>
          <p>
            <strong>Intensity:</strong> {result.analysis.delivery.intensity}
          </p>
          <p>
            <strong>Rushed Risk:</strong> {result.analysis.delivery.rushedRisk}
          </p>
          <p>
            <strong>Sharpness Risk:</strong> {result.analysis.delivery.sharpnessRisk}
          </p>
          <p>
            <strong>Hesitation Risk:</strong> {result.analysis.pacing.hesitationRisk}
          </p>
          <p>
            <strong>Interruption Risk:</strong> {result.analysis.delivery.interruptionRisk}
          </p>

          <h4>Coaching Signals</h4>
          <ul>
            {result.analysis.coachingSignals.map((signal, index) => (
              <li key={index}>{signal}</li>
            ))}
          </ul>

          <details>
            <summary>Raw JSON</summary>
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
