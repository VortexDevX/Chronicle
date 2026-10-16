type NotificationStateInput = {
  progressCurrent: number;
  latestRemoteProgress?: number | null;
  lastNotifiedProgress?: number | null;
};

function finiteProgress(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getNotificationBaseline({
  progressCurrent,
  latestRemoteProgress,
  lastNotifiedProgress,
}: NotificationStateInput): number {
  const current = finiteProgress(progressCurrent) ?? 0;
  const notified = finiteProgress(lastNotifiedProgress);
  const legacyBaseline = finiteProgress(latestRemoteProgress);

  // If lastNotifiedProgress is corrupted or from an older/different numbering scale
  // such that it exceeds latestRemoteProgress, it cannot represent a valid notification baseline.
  const validNotified =
    notified !== null && legacyBaseline !== null && notified > legacyBaseline
      ? null
      : notified;

  return Math.max(current, validNotified ?? legacyBaseline ?? current);
}

export function shouldNotifyProgress(
  latestRemoteProgress: number | null,
  baseline: number,
): latestRemoteProgress is number {
  return (
    typeof latestRemoteProgress === "number" &&
    Number.isFinite(latestRemoteProgress) &&
    latestRemoteProgress > baseline
  );
}
