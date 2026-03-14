import fs from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export async function runFfmpegToPCM(
  inputPath: string
): Promise<{ pcmPath: string; sampleRate: number }> {
  const outPath = path.join(os.tmpdir(), `${randomId("pcm")}.wav`);
  const sampleRate = 16000;

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      String(sampleRate),
      "-f",
      "wav",
      outPath
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (d) => {
      stderr += d.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
    });
  });

  return { pcmPath: outPath, sampleRate };
}

export async function readWavPCM16Mono(
  filePath: string
): Promise<{ sampleRate: number; samples: Float32Array }> {
  const buf = await fs.readFile(filePath);

  if (
    buf.toString("ascii", 0, 4) !== "RIFF" ||
    buf.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("Unsupported WAV format");
  }

  let offset = 12;
  let sampleRate = 16000;
  let dataOffset = -1;
  let dataSize = 0;
  let bitsPerSample = 16;
  let numChannels = 1;
  let audioFormat = 1;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;

    if (chunkId === "fmt ") {
      audioFormat = buf.readUInt16LE(chunkDataStart + 0);
      numChannels = buf.readUInt16LE(chunkDataStart + 2);
      sampleRate = buf.readUInt32LE(chunkDataStart + 4);
      bitsPerSample = buf.readUInt16LE(chunkDataStart + 14);
    } else if (chunkId === "data") {
      dataOffset = chunkDataStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataStart + chunkSize;
  }

  if (audioFormat !== 1) throw new Error("Only PCM WAV supported");
  if (numChannels !== 1) throw new Error("Only mono WAV supported");
  if (bitsPerSample !== 16) throw new Error("Only 16-bit WAV supported");
  if (dataOffset < 0) throw new Error("WAV data chunk not found");

  const sampleCount = dataSize / 2;
  const out = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = buf.readInt16LE(dataOffset + i * 2);
    out[i] = int16 / 32768;
  }

  return { sampleRate, samples: out };
}

export async function safeDelete(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    await fs.rm(filePath, { force: true });
  } catch {}
}
