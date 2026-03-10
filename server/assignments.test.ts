import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Track insert calls to verify values
const mockInsertValues = vi.fn().mockResolvedValue([{ insertId: 1 }]);
const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
const mockWhereOrderBy = vi.fn().mockResolvedValue([]);
const mockWhereLimit = vi.fn().mockResolvedValue([{ id: 2, managerId: 1 }]);
const mockSelectWhere = vi.fn().mockReturnValue({
  orderBy: mockWhereOrderBy,
  limit: mockWhereLimit,
});
const mockLeftJoinWhere = vi.fn().mockReturnValue({
  orderBy: vi.fn().mockResolvedValue([]),
});
const mockSelectFrom = vi.fn().mockReturnValue({
  where: mockSelectWhere,
  leftJoin: vi.fn().mockReturnValue({
    where: mockLeftJoinWhere,
  }),
});
const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

const mockDb = {
  insert: mockInsert,
  select: mockSelect,
  update: vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  }),
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
      openId: "test-manager",
      email: "manager@wsc.com",
      name: "Test Manager",
      loginMethod: "manus",
      role: "admin",
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
      openId: "test-employee",
      email: "employee@wsc.com",
      name: "Test Employee",
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("assignments.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(null);
    mockWhereLimit.mockResolvedValue([{ id: 2, managerId: 1 }]);
    mockWhereOrderBy.mockResolvedValue([]);
  });

  it("requires manager role - rejects unauthenticated users", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.assignments.create({
        employeeId: 2,
        title: "Test assignment",
        scenarioFamily: "billing_confusion",
        department: "customer_service",
      })
    ).rejects.toThrow("Please login");
  });

  it("requires manager role - rejects regular employees", async () => {
    const caller = appRouter.createCaller(createEmployeeContext());
    await expect(
      caller.assignments.create({
        employeeId: 2,
        title: "Test assignment",
        scenarioFamily: "billing_confusion",
        department: "customer_service",
      })
    ).rejects.toThrow("Manager access required");
  });

  it("returns success false when database is not available", async () => {
    mockGetDb.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(createManagerContext());
    const result = await caller.assignments.create({
      employeeId: 2,
      title: "Test assignment",
      scenarioFamily: "billing_confusion",
      department: "customer_service",
    });
    expect(result.success).toBe(false);
  });

  it("creates assignment with all optional fields provided", async () => {
    mockGetDb.mockResolvedValueOnce(mockDb as any);
    // Also mock for the audit log insert
    mockGetDb.mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(createManagerContext());
    const result = await caller.assignments.create({
      employeeId: 2,
      title: "Billing drill",
      scenarioFamily: "billing_confusion",
      department: "customer_service",
      scenarioTemplateId: 5,
      difficultyMin: 3,
      difficultyMax: 5,
      requiredAttempts: 2,
      dueDate: "2026-04-01",
      notes: "Focus on de-escalation",
    });

    expect(result.success).toBe(true);
    expect(mockInsert).toHaveBeenCalled();
    // Verify the values passed to insert include scenarioTemplateId
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.employeeId).toBe(2);
    expect(insertCall.title).toBe("Billing drill");
    expect(insertCall.scenarioFamily).toBe("billing_confusion");
    expect(insertCall.department).toBe("customer_service");
    expect(insertCall.scenarioTemplateId).toBe(5);
    expect(insertCall.difficultyMin).toBe(3);
    expect(insertCall.difficultyMax).toBe(5);
    expect(insertCall.requiredAttempts).toBe(2);
    expect(insertCall.notes).toBe("Focus on de-escalation");
    expect(insertCall.dueDate).toBeInstanceOf(Date);
  });

  it("creates assignment without optional fields - no null int values", async () => {
    mockGetDb.mockResolvedValueOnce(mockDb as any);
    mockGetDb.mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(createManagerContext());
    const result = await caller.assignments.create({
      employeeId: 2,
      title: "Quick drill",
      scenarioFamily: "billing_confusion",
      department: "customer_service",
    });

    expect(result.success).toBe(true);
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.employeeId).toBe(2);
    expect(insertCall.title).toBe("Quick drill");
    expect(insertCall.scenarioFamily).toBe("billing_confusion");
    expect(insertCall.department).toBe("customer_service");
    // scenarioTemplateId should NOT be present (not set to null or empty string)
    expect(insertCall.scenarioTemplateId).toBeUndefined();
    // notes should NOT be present when not provided
    expect(insertCall.notes).toBeUndefined();
    // dueDate should NOT be present when not provided
    expect(insertCall.dueDate).toBeUndefined();
  });

  it("creates assignment with only required fields", async () => {
    mockGetDb.mockResolvedValueOnce(mockDb as any);
    mockGetDb.mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(createManagerContext());
    const result = await caller.assignments.create({
      employeeId: 2,
      title: "Minimal drill",
    });

    expect(result.success).toBe(true);
    const insertCall = mockInsertValues.mock.calls[0][0];
    expect(insertCall.employeeId).toBe(2);
    expect(insertCall.title).toBe("Minimal drill");
    expect(insertCall.assignedBy).toBe(1);
    // Optional fields should be absent, not null
    expect(insertCall).not.toHaveProperty("scenarioTemplateId");
    expect(insertCall).not.toHaveProperty("scenarioFamily");
    expect(insertCall).not.toHaveProperty("department");
    expect(insertCall).not.toHaveProperty("notes");
    expect(insertCall).not.toHaveProperty("dueDate");
  });
});

describe("assignments.start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(null);
  });

  it("marks an assigned drill as in progress for the owning employee", async () => {
    mockWhereLimit.mockResolvedValueOnce([{ id: 8, employeeId: 2, status: "assigned" }]);
    mockGetDb.mockResolvedValueOnce(mockDb as any);
    mockGetDb.mockResolvedValueOnce(mockDb as any);

    const caller = appRouter.createCaller(createEmployeeContext());
    const result = await caller.assignments.start({ id: 8 });

    expect(result).toEqual({ success: true, status: "in_progress" });
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("assignments.teamAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(null);
    mockWhereLimit.mockResolvedValue([{ id: 2, managerId: 1 }]);
    mockWhereOrderBy.mockResolvedValue([]);
  });

  it("requires manager role", async () => {
    const caller = appRouter.createCaller(createEmployeeContext());
    await expect(
      caller.assignments.teamAssignments({})
    ).rejects.toThrow("Manager access required");
  });

  it("returns empty array when database is not available", async () => {
    mockGetDb.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(createManagerContext());
    const result = await caller.assignments.teamAssignments({});
    expect(result).toEqual([]);
  });
});
