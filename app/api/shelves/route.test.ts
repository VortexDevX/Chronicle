import { NextRequest } from "next/server";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, PUT } from "./route";

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
    findOneAndUpdate: vi.fn(),
  },
  MediaItem: {exists:vi.fn()},
}));

vi.mock("@/lib/log", () => ({
  logInternalError: vi.fn(),
}));

import { Shelf, MediaItem } from "@/lib/models";

const findOneMock = Shelf.findOne as unknown as ReturnType<typeof vi.fn>;
const createMock = Shelf.create as unknown as ReturnType<typeof vi.fn>;

describe("shelves API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("changes membership atomically without replacing other entries", async () => {
    vi.mocked(MediaItem.exists).mockResolvedValue({_id:new Types.ObjectId("507f1f77bcf86cd799439012")});
    vi.mocked(Shelf.findOneAndUpdate).mockResolvedValue({_id:"507f1f77bcf86cd799439013"});
    const response=await PUT(new NextRequest("https://chronicle.example/api/shelves?id=507f1f77bcf86cd799439013",{method:"PUT",body:JSON.stringify({add_media_id:"507f1f77bcf86cd799439012"})}));
    expect(response.status).toBe(200);
    expect(Shelf.findOneAndUpdate).toHaveBeenCalledWith({_id:"507f1f77bcf86cd799439013",user_id:"507f1f77bcf86cd799439011"},{$addToSet:{media_ids:expect.anything()}},{new:true});
    expect(findOneMock).not.toHaveBeenCalled();
  });

  it("cannot add another user's entry", async () => {
    vi.mocked(MediaItem.exists).mockResolvedValue(null);
    const response=await PUT(new NextRequest("https://chronicle.example/api/shelves?id=507f1f77bcf86cd799439013",{method:"PUT",body:JSON.stringify({add_media_id:"507f1f77bcf86cd799439012"})}));
    expect(response.status).toBe(404);
    expect(Shelf.findOneAndUpdate).not.toHaveBeenCalled();
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
