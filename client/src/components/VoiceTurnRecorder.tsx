import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <div className="space-y-6">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Voice Turn Recorder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Session <span className="font-mono text-foreground">{sessionId}</span>
              {" · "}
              Employee <span className="font-mono text-foreground">{employeeId}</span>
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              placeholder="Optional transcript for this employee turn..."
              className="bg-background border-border"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            {!isRecording ? (
              <Button onClick={startRecording} className="bg-teal text-slate-deep hover:bg-teal/90">
                Start Recording
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive">
                Stop Recording
              </Button>
            )}
          </div>

          {error && (
            <Alert className="border-red-500/40 bg-red-500/10 text-red-100">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Analysis Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <Metric label="Turn ID" value={result.turnId} mono />
              <Metric label="Duration" value={`${result.analysis.audio.durationSec}s`} />
              <Metric label="Intensity" value={result.analysis.delivery.intensity} />
              <Metric label="Rushed Risk" value={result.analysis.delivery.rushedRisk} />
              <Metric label="Sharpness Risk" value={result.analysis.delivery.sharpnessRisk} />
              <Metric label="Hesitation Risk" value={result.analysis.pacing.hesitationRisk} />
              <Metric label="Interruption Risk" value={result.analysis.delivery.interruptionRisk} />
              <Metric label="Loudness" value={result.analysis.delivery.loudnessConsistency} />
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Coaching Signals
              </h4>
              <ul className="space-y-2">
                {result.analysis.coachingSignals.map((signal, index) => (
                  <li key={`${signal}-${index}`} className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm">
                    {signal}
                  </li>
                ))}
              </ul>
            </div>

            <details className="rounded-md border border-border bg-background/60 p-3">
              <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <Badge variant="outline" className={mono ? "font-mono text-xs" : "text-xs capitalize"}>
        {value}
      </Badge>
    </div>
  );
}
