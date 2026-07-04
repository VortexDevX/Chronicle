import mongoose from "mongoose";
import { describe, expect, it } from "vitest";
import {
  mediaIdentityKey,
  prepareBulkMediaDocs,
} from "@/lib/services/media/bulkImport";

describe("bulk media import", () => {
  it("skips invalid, in-file duplicate, and already existing items", () => {
    const userId = new mongoose.Types.ObjectId();
    const existing = new Set([mediaIdentityKey("Anime", "Existing Show")]);

    const result = prepareBulkMediaDocs(
      [
        {
          title: "Existing Show",
          media_type: "Anime",
          status: "Active",
        },
        {
          title: "New Show",
          media_type: "Anime",
          status: "Planned",
        },
        {
          title: " new   show ",
          media_type: "Anime",
          status: "Planned",
        },
        {
          title: "",
          media_type: "Anime",
          status: "Active",
        },
      ],
      userId,
      existing,
    );

    expect(result.docs).toHaveLength(1);
    expect(result.skipped).toBe(3);
    expect(result.docs[0]).toMatchObject({
      title: "New Show",
      dedupe_key: "new show",
      user_id: userId,
    });
  });
});
