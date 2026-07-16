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

  return Math.max(current, notified ?? legacyBaseline ?? current);
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
