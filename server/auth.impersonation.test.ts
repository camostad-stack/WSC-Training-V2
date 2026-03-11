import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const { getUserById, logAudit } = vi.hoisted(() => ({
  getUserById: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getUserById,
}));

vi.mock("./services/audit-log", () => ({
  logAudit,
}));

import { appRouter } from "./routers";
import { IMPERSONATION_COOKIE_NAME } from "./_core/sdk";

function createAdminContext(overrides?: Partial<TrpcContext>) {
  const cookieCalls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const clearCookieCalls: Array<{ name: string; options: Record<string, unknown> }> = [];

  const adminUser = {
    id: 1,
    openId: "admin-open-id",
    email: "admin@wsc.com",
    name: "Admin User",
    loginMethod: "supabase_email",
    role: "admin" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    isActive: true,
    department: null,
    managerId: null,
  };

  const ctx: TrpcContext = {
    user: adminUser,
    actorUser: adminUser,
    impersonation: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookieCalls.push({ name, value, options });
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearCookieCalls.push({ name, options });
      },
    } as unknown as TrpcContext["res"],
    ...overrides,
  };

  return { ctx, cookieCalls, clearCookieCalls, adminUser };
}

describe("auth impersonation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts impersonation for an active employee and sets the impersonation cookie", async () => {
    const { ctx, cookieCalls, adminUser } = createAdminContext();
    getUserById.mockResolvedValueOnce({
      id: 7,
      openId: "employee-open-id",
      email: "employee@wsc.com",
      name: "Employee User",
      loginMethod: "supabase_email",
      role: "employee",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      isActive: true,
      department: "customer_service",
      managerId: adminUser.id,
    });

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.startImpersonation({ targetUserId: 7 });

    expect(result.success).toBe(true);
    expect(result.targetUser.id).toBe(7);
    expect(cookieCalls).toHaveLength(1);
    expect(cookieCalls[0]?.name).toBe(IMPERSONATION_COOKIE_NAME);
    expect(cookieCalls[0]?.value).toBe("7");
    expect(logAudit).toHaveBeenCalledWith(
      adminUser.id,
      "role_change",
      "user",
      7,
      expect.objectContaining({ impersonation: "start" }),
    );
  });

  it("returns actor and target identities when impersonation is active", async () => {
    const { adminUser } = createAdminContext();
    const ctx: TrpcContext = {
      user: {
        id: 7,
        openId: "employee-open-id",
        email: "employee@wsc.com",
        name: "Employee User",
        loginMethod: "supabase_email",
        role: "employee",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        isActive: true,
        department: "customer_service",
        managerId: adminUser.id,
      },
      actorUser: adminUser,
      impersonation: { targetUserId: 7 },
      req: {
        protocol: "https",
        headers: {},
      } as TrpcContext["req"],
      res: {
        clearCookie: vi.fn(),
      } as unknown as TrpcContext["res"],
    };

    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();

    expect(result?.user.name).toBe("Employee User");
    expect(result?.actorUser.name).toBe("Admin User");
    expect(result?.impersonation).toMatchObject({
      active: true,
      targetUserId: 7,
      actorUserId: adminUser.id,
    });
  });

  it("stops impersonation by clearing the impersonation cookie", async () => {
    const { ctx, clearCookieCalls, adminUser } = createAdminContext({
      user: {
        id: 7,
        openId: "employee-open-id",
        email: "employee@wsc.com",
        name: "Employee User",
        loginMethod: "supabase_email",
        role: "employee",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
        isActive: true,
        department: "customer_service",
        managerId: 1,
      },
      impersonation: { targetUserId: 7 },
    });
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.stopImpersonation();
    expect(result).toEqual({ success: true });
    expect(clearCookieCalls).toHaveLength(1);
    expect(clearCookieCalls[0]?.name).toBe(IMPERSONATION_COOKIE_NAME);
    expect(logAudit).toHaveBeenCalledWith(
      adminUser.id,
      "role_change",
      "user",
      7,
      expect.objectContaining({ impersonation: "stop" }),
    );
  });
});
