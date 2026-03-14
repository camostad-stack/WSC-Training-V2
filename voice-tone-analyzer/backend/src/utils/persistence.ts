import fs from "fs/promises";
import path from "path";
import { SessionTurnRecord } from "../types";

const DATA_DIR = path.join(process.cwd(), "voice_training_data");
const TURNS_DIR = path.join(DATA_DIR, "turns");

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function persistTurn(record: SessionTurnRecord): Promise<void> {
  await ensureDir(TURNS_DIR);
  const filePath = path.join(TURNS_DIR, `${record.turnId}.json`);
  await fs.writeFile(filePath, JSON.stringify(record, null, 2), "utf8");
}

export async function getRecentTurnsByEmployee(
  employeeId: string
): Promise<SessionTurnRecord[]> {
  await ensureDir(TURNS_DIR);
  const files = await fs.readdir(TURNS_DIR);
  const turns: SessionTurnRecord[] = [];

  for (const file of files) {
    const fullPath = path.join(TURNS_DIR, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = JSON.parse(raw) as SessionTurnRecord;

    if (parsed.employeeId === employeeId) {
      turns.push(parsed);
    }
  }

  turns.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return turns.slice(0, 50);
}
