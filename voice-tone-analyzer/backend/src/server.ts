import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import os from "os";

import { SessionTurnRecord } from "./types";
import {
  randomId,
  readWavPCM16Mono,
  runFfmpegToPCM,
  safeDelete,
} from "./utils/audio";
import { analyzeRawAudio } from "./utils/features";
import { getRecentTurnsByEmployee, persistTurn } from "./utils/persistence";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "voice-tone-capture-uploads"),
  limits: { fileSize: 50 * 1024 * 1024 },
});

app.get("/health", async (_req, res) => {
  res.json({ ok: true });
});

app.post("/analyze-audio-turn", upload.single("audio"), async (req, res) => {
  const uploaded = req.file;

  if (!uploaded) {
    return res.status(400).json({
      error: "Missing audio file field: audio",
    });
  }

  const sessionId = String(req.body.sessionId || randomId("session"));
  const employeeId = String(req.body.employeeId || "unknown_employee");
  const transcript =
    typeof req.body.transcript === "string" ? req.body.transcript : undefined;
  const turnId = randomId("turn");

  let decodedPath: string | null = null;

  try {
    const ffmpegResult = await runFfmpegToPCM(uploaded.path);
    decodedPath = ffmpegResult.pcmPath;

    const { sampleRate, samples } = await readWavPCM16Mono(decodedPath);
    const analysis = analyzeRawAudio(samples, sampleRate, transcript);

    const record: SessionTurnRecord = {
      sessionId,
      employeeId,
      turnId,
      createdAt: new Date().toISOString(),
      transcript,
      analysis,
    };

    await persistTurn(record);

    return res.json({
      ok: true,
      turnId,
      sessionId,
      employeeId,
      analysis,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Audio analysis failed",
      details: error?.message || String(error),
    });
  } finally {
    await safeDelete(uploaded.path);
    await safeDelete(decodedPath);
  }
});

app.get("/employee/:employeeId/recent-turns", async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const turns = await getRecentTurnsByEmployee(employeeId);

    return res.json({
      employeeId,
      count: turns.length,
      turns,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to read employee turns",
      details: error?.message || String(error),
    });
  }
});

const PORT = Number(process.env.PORT || 3010);

app.listen(PORT, () => {
  console.log(`voice tone capture backend listening on :${PORT}`);
});
