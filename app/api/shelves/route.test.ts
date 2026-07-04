import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("@/lib/guards", () => ({
  requireAuthUserId: vi.fn().mockResolvedValue({
    userId: "507f1f77bcf86cd799439011",
  }),
}));

vi.mock("@/lib/models", () => ({
  Shelf: {
    findOne: vi.fn(),
    create: vi.fn(),
  },
  MediaItem: {},
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { Shelf } from "@/lib/models";

const findOneMock = Shelf.findOne as unknown as ReturnType<typeof vi.fn>;
const createMock = Shelf.create as unknown as ReturnType<typeof vi.fn>;

describe("shelves API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects duplicate shelf names", async () => {
    findOneMock.mockResolvedValue({ _id: "existing" });

    const res = await POST(
      new NextRequest("https://chronicle.example/api/shelves", {
        method: "POST",
        body: JSON.stringify({ name: "Favorites" }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("DUPLICATE_NAME");
    expect(createMock).not.toHaveBeenCalled();
  });
});
