import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../drizzle/schema";
import { ENV } from "./_core/env";

let _client: postgres.Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

export type Database = PostgresJsDatabase<typeof schema>;

function createClient(connectionString: string) {
  return postgres(connectionString, {
    ssl: "require",
    max: 1,
    prepare: false,
  });
}

export async function getDb(): Promise<Database> {
  if (!_db) {
    if (!ENV.databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }

    try {
      _client = createClient(ENV.databaseUrl);
      _db = drizzle(_client, { schema });
    } catch (error) {
      if (_client) {
        await _client.end({ timeout: 5 }).catch(() => undefined);
      }
      _client = null;
      _db = null;
      throw error;
    }
  }

  return _db;
}

export async function closeDb() {
  if (_client) {
    await _client.end({ timeout: 5 });
  }
  _client = null;
  _db = null;
}

export async function upsertUser(user: schema.InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();

  try {
    const values: schema.InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (user.department !== undefined) {
      values.department = user.department;
      updateSet.department = user.department;
    }
    if (user.managerId !== undefined) {
      values.managerId = user.managerId;
      updateSet.managerId = user.managerId;
    }
    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db
      .insert(schema.users)
      .values(values)
      .onConflictDoUpdate({
        target: schema.users.openId,
        set: updateSet,
      });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  const result = await db.select().from(schema.users).where(eq(schema.users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  const result = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}
