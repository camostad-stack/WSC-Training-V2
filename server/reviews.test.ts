import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockDb = {
  select: mockSelect,
  insert: vi.fn(),
  update: vi.fn(),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { getDb } from "./db";

const mockGetDb = vi.mocked(getDb);

function createManagerContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "manager-openid",
      email: "manager@wsc.com",
      name: "Manager User",
      loginMethod: "manus",
      role: "manager",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createEmployeeContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "employee-openid",
      email: "employee@wsc.com",
      name: "Employee User",
      loginMethod: "manus",
      role: "employee",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("reviews.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(null);
    mockLimit.mockReset();
    mockWhere.mockClear();
    mockFrom.mockClear();
    mockSelect.mockClear();
  });

  it("requires manager role", async () => {
    const caller = appRouter.createCaller(createEmployeeContext());
    await expect(
      caller.reviews.create({
        sessionId: 12,
        employeeId: 2,
        originalScore: 78,
        followUpRequired: false,
        shadowingNeeded: false,
      }),
    ).rejects.toThrow("Manager access required");
  });

  it("requires an override reason when changing the score", async () => {
    mockGetDb.mockResolvedValue(mockDb as any);
    mockLimit
      .mockResolvedValueOnce([{ id: 12, userId: 2, difficulty: 3, department: "customer_service" }])
      .mockResolvedValueOnce([{ id: 2, managerId: 1 }]);

    const caller = appRouter.createCaller(createManagerContext());

    await expect(
      caller.reviews.create({
        sessionId: 12,
        employeeId: 2,
        originalScore: 78,
        overrideScore: 65,
        overrideReason: "",
        followUpRequired: false,
        shadowingNeeded: false,
      }),
    ).rejects.toThrow("Override reason is required when changing a score");

    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});
