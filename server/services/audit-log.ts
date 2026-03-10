import { auditLogs, AUDIT_ACTIONS } from "../../drizzle/schema";
import { getDb } from "../db";

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export async function logAudit(
  userId: number,
  action: AuditAction,
  targetType: string,
  targetId?: number | null,
  details?: unknown,
) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(auditLogs).values({
      userId,
      action,
      targetType,
      targetId: targetId ?? null,
      details: details ?? null,
    });
  } catch (error) {
    console.error("[Audit] Failed to log:", error);
  }
}
