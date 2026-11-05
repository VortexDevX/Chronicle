export function segment(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Invalid storage identifier");
  return value;
}
export function chapterKey(slug: string, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Invalid chapter number");
  return `novels/${segment(slug)}/chapters/${String(number).padStart(6, "0")}.txt`;
}
export function coverKey(slug: string, extension: string) {
  if (!["jpg", "jpeg", "png", "webp"].includes(extension)) throw new Error("Invalid image format");
  return `novels/${segment(slug)}/cover.${extension}`;
}
