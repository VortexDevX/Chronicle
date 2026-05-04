export const MEDIA_TYPES = ["Anime", "Manhwa", "Donghua", "Light Novel"] as const;
export const MEDIA_STATUSES = [
  "Planned",
  "Active",
  "On Hold",
  "Dropped",
  "Completed",
] as const;

const allowedTypes = new Set<string>(MEDIA_TYPES);
const allowedStatuses = new Set<string>(MEDIA_STATUSES);

export function isAllowedMediaType(value: string): boolean {
  return allowedTypes.has(value);
}

export function isAllowedMediaStatus(value: string): boolean {
  return allowedStatuses.has(value);
}
