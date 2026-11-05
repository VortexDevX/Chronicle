import { NextRequest } from "next/server";
import { readerSettingsSchema } from "@/lib/novels/reader-settings";
import { novelApi } from "@/lib/novels/api";
import { ReaderPreferences } from "@/lib/novels/models/ReaderPreferences";
export async function GET(req: NextRequest) {
  return novelApi(req, async userId => (await ReaderPreferences.findOne({ user_id: userId }).lean()) || {});
}
export async function PUT(req: NextRequest) {
  return novelApi(req, async userId => {
    const settings = readerSettingsSchema.parse(await req.json());
    return ReaderPreferences.findOneAndUpdate({ user_id: userId }, { $set: settings }, { upsert: true, new: true, runValidators: true });
  });
}
