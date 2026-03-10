import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { simulationSessions, users } from "../../drizzle/schema";
import { getDb } from "../db";

export interface ActorIdentity {
  id: number;
  role: string;
}

export function isGlobalAdmin(role?: string | null) {
  return role === "admin" || role === "super_admin";
}

export async function assertManagerCanAccessEmployee(
  managerUser: ActorIdentity,
  employeeId: number,
) {
  const db = await getDb();
  if (!db) return null;

  const employeeRows = await db.select().from(users).where(eq(users.id, employeeId)).limit(1);
  const employee = employeeRows[0];

  if (!employee) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Employee not found" });
  }

  if (!isGlobalAdmin(managerUser.role) && employee.managerId !== managerUser.id) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not your team member" });
  }

  return employee;
}

export async function assertManagerCanAccessSession(
  managerUser: ActorIdentity,
  sessionId: number,
) {
  const db = await getDb();
  if (!db) return { db: null, session: null };

  const sessionRows = await db.select().from(simulationSessions).where(eq(simulationSessions.id, sessionId)).limit(1);
  const session = sessionRows[0];

  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
  }

  await assertManagerCanAccessEmployee(managerUser, session.userId);
  return { db, session };
}
