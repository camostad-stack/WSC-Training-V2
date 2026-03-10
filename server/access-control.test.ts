import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLimit = vi.fn();
const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

const mockDb = {
  select: mockSelect,
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

import { getDb } from "./db";
import { assertManagerCanAccessEmployee, assertManagerCanAccessSession } from "./services/access-control";

const mockGetDb = vi.mocked(getDb);

describe("access-control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReset();
    mockGetDb.mockResolvedValue(mockDb as any);
    mockLimit.mockReset();
    mockWhere.mockClear();
    mockFrom.mockClear();
    mockSelect.mockClear();
  });

  it("blocks managers from accessing employees outside their team", async () => {
    mockLimit.mockResolvedValueOnce([{ id: 44, managerId: 99 }]);

    await expect(
      assertManagerCanAccessEmployee({ id: 1, role: "manager" }, 44),
    ).rejects.toThrow("Not your team member");
  });

  it("allows admins to access any session owner", async () => {
    mockLimit
      .mockResolvedValueOnce([{ id: 12, userId: 44 }])
      .mockResolvedValueOnce([{ id: 44, managerId: 99 }]);

    const result = await assertManagerCanAccessSession({ id: 7, role: "admin" }, 12);

    expect(result.session?.id).toBe(12);
    expect(result.session?.userId).toBe(44);
  });
});
