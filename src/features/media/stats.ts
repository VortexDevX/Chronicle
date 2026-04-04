/** Stats rendering. */

import { state } from "../../state/store.js";
import { escapeHtml } from "../../utils/format.js";

export function renderStats(): string {
  const total = state.total || state.media.length;
  if (total === 0) return "";

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let ratingSum = 0;
  let ratingCount = 0;

  state.media.forEach((m) => {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    byType[m.media_type] = (byType[m.media_type] || 0) + 1;
    if (m.rating) {
      ratingSum += m.rating;
      ratingCount++;
    }
  });

  const avgRating =
    ratingCount > 0 ? (ratingSum / ratingCount).toFixed(1) : "—";

  const watching = byStatus["Watching/Reading"] || 0;
  const completed = byStatus["Completed"] || 0;
  const planned = byStatus["Planned"] || 0;
  const onHold = byStatus["On Hold"] || 0;
  const dropped = byStatus["Dropped"] || 0;

  const typeChips = Object.entries(byType)
    .map(
      ([type, count]) =>
        `<span class="stat-chip"><strong>${count}</strong>&nbsp;${escapeHtml(type)}</span>`,
    )
    .join("");

  return `
    <div class="stats-section">
      <div class="stats-bar">
        <span class="stat-chip"><strong>${total}</strong>&nbsp;Total</span>
        <span class="stat-chip stat-active"><strong>${watching}</strong>&nbsp;Active</span>
        <span class="stat-chip stat-completed"><strong>${completed}</strong>&nbsp;Completed</span>
        <span class="stat-chip"><strong>${planned}</strong>&nbsp;Planned</span>
        ${onHold ? `<span class="stat-chip stat-hold"><strong>${onHold}</strong>&nbsp;On Hold</span>` : ""}
        ${dropped ? `<span class="stat-chip stat-dropped"><strong>${dropped}</strong>&nbsp;Dropped</span>` : ""}
      </div>
      <div class="stats-bar stats-secondary">
        ${typeChips}
        <span class="stat-chip stat-accent">★ ${avgRating} avg</span>
      </div>
    </div>
  `;
}

export function renderStatsHost(): void {
  const host = document.getElementById("stats-host");
  if (host) host.innerHTML = renderStats();
}
