import Chart from "chart.js/auto";
import { store } from "../../state/store.js";
import { selectors } from "../../state/selectors.js";
import { escapeHtml } from "../../utils/format.js";
import { apiFetch } from "../../api/client.js";

let chartInstances: Chart[] = [];

export function renderStats(): string {
  const state = store.get();
  const stats = state.globalStats || selectors.getStats();

  const total = stats.total;
  if (total === 0) {
    return `
      <div class="empty-state">
        <h3>No Archives</h3>
        <p>Your library is empty. Add some entries to view statistics.</p>
      </div>
    `;
  }

  const formatEntries = Object.entries(stats.byType);
  const topFormat =
    formatEntries.length > 0
      ? formatEntries.reduce((a, b) => (a[1] > b[1] ? a : b))
      : ["Unknown", 0];

  const completionRate =
    total > 0 ? Math.round((stats.completed / total) * 100) : 0;

  return `
    <div class="analytics-dashboard">
      <div class="analytics-header">
        <h2>Analytics Dashboard</h2>
      </div>

      <div class="analytics-summary-grid">
        <div class="analytics-card" style="border-top: 4px solid var(--violet)">
          <div class="analytics-card-title">Total Library</div>
          <div class="analytics-card-value">${total}</div>
        </div>
        <div class="analytics-card" style="border-top: 4px solid var(--cyan)">
          <div class="analytics-card-title">Active Series</div>
          <div class="analytics-card-value">${stats.watching}</div>
        </div>
        <div class="analytics-card" style="border-top: 4px solid var(--green)">
          <div class="analytics-card-title">Completed</div>
          <div class="analytics-card-value">${stats.completed}</div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: auto; display:flex; justify-content: space-between;">
            <span>Completion Rate</span>
            <strong>${completionRate}%</strong>
          </div>
          <div style="height: 4px; background: var(--bg-root); border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${completionRate}%; background: var(--green);"></div>
          </div>
        </div>
        <div class="analytics-card" style="border-top: 4px solid var(--amber)">
          <div class="analytics-card-title">On Hold</div>
          <div class="analytics-card-value">${stats.onHold || 0}</div>
        </div>
        <div class="analytics-card" style="border-top: 4px solid var(--red)">
          <div class="analytics-card-title">Dropped</div>
          <div class="analytics-card-value">${stats.dropped || 0}</div>
        </div>
      </div>

      <div class="analytics-charts-row">
        <div class="analytics-chart-box">
          <h3>Status Distribution</h3>
          <div class="analytics-chart-container">
            <canvas id="chart-status"></canvas>
          </div>
        </div>
        <div class="analytics-chart-box">
          <h3>Type Distribution</h3>
          <div class="analytics-chart-container">
            <canvas id="chart-type"></canvas>
          </div>
        </div>
      </div>

      <div class="analytics-tertiary-row">
        <div class="analytics-chart-box">
          <h3>Library Insights</h3>
          <div class="analytics-insight-list">
            <div class="analytics-insight-item">
              <strong>${completionRate}%</strong> of your entire library has been fully completed.
            </div>
            <div class="analytics-insight-item">
              Your most consumed format is <strong>${escapeHtml(String(topFormat[0]))}</strong> (${topFormat[1]} entries).
            </div>
            <div class="analytics-insight-item">
              Your average library rating sits at <strong>★ ${stats.avgRating}</strong>.
            </div>
            <div class="analytics-insight-item">
              You've dropped ${stats.dropped || 0} series out of ${total} total tracked records.
            </div>
          </div>
        </div>
        <div class="analytics-chart-box">
          <h3>Recent Archives</h3>
          <div class="analytics-activity-list" id="analytics-recent-list">
            <div style="padding: 20px; text-align: center; color: var(--text-secondary);">
              <span class="spinner"></span> Loading history...
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderStatsHost(): void {
  const host = document.getElementById("stats-host");
  if (!host) return;

  // Destroy old charts to prevent memory leak / canvas reuse errors
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances = [];

  host.innerHTML = renderStats();

  const state = store.get();
  const stats = state.globalStats || selectors.getStats();
  if (stats.total === 0) return;

  // Chart global defaults for dark theme
  Chart.defaults.color = "#8b949e";
  Chart.defaults.font.family = "'Outfit', sans-serif";
  const tooltip = (Chart.defaults as any).plugins?.tooltip;
  if (tooltip) {
    tooltip.backgroundColor = "rgba(10, 12, 16, 0.9)";
    tooltip.titleColor = "#f0f6fc";
    tooltip.bodyColor = "#c9d1d9";
    tooltip.borderColor = "#30363d";
    tooltip.borderWidth = 1;
  }

  // Status donut
  const ctxStatus = document.getElementById(
    "chart-status",
  ) as HTMLCanvasElement;
  if (ctxStatus) {
    chartInstances.push(
      new Chart(ctxStatus, {
        type: "doughnut",
        data: {
          labels: ["Active", "Completed", "Planned", "On Hold", "Dropped"],
          datasets: [
            {
              data: [
                stats.watching,
                stats.completed,
                stats.planned,
                stats.onHold,
                stats.dropped,
              ],
              backgroundColor: [
                "#38bdf8",
                "#34d399",
                "#a78bfa",
                "#fbbf24",
                "#f87171",
              ],
              borderColor: "#0d1117",
              borderWidth: 2,
              hoverOffset: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "right" } },
          cutout: "70%",
        },
      }),
    );
  }

  // Type bar
  const ctxType = document.getElementById("chart-type") as HTMLCanvasElement;
  if (ctxType) {
    const sortedTypes = Object.entries(stats.byType).sort(
      (a, b) => b[1] - a[1],
    );
    chartInstances.push(
      new Chart(ctxType, {
        type: "bar",
        data: {
          labels: sortedTypes.map((t) => t[0]),
          datasets: [
            {
              label: "# of Entries",
              data: sortedTypes.map((t) => t[1]),
              backgroundColor: "#818cf8",
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.05)" } },
            x: { grid: { display: false } },
          },
        },
      }),
    );
  }

  setTimeout(loadRecentActivity, 0);
}

async function loadRecentActivity() {
  try {
    const listHost = document.getElementById("analytics-recent-list");
    if (!listHost) return;

    const res = await apiFetch("/media?limit=5&sort=updatedAt:-1");
    if (res.data && res.data.items) {
      if (res.data.items.length === 0) {
        listHost.innerHTML =
          '<div style="color:var(--text-secondary); text-align:center;">No recent archival events.</div>';
        return;
      }
      listHost.innerHTML = res.data.items
        .map(
          (item: any) => `
          <div class="analytics-activity-item">
            <div class="activity-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;" title="${escapeHtml(item.title)}">
              ${escapeHtml(item.title)}
            </div>
            <div class="activity-meta">
              ${item.status === "Completed" ? '<span style="color:var(--green)">Completed</span>' : "Updated"}
            </div>
          </div>
        `,
        )
        .join("");
    }
  } catch {
    const listHost = document.getElementById("analytics-recent-list");
    if (listHost)
      listHost.innerHTML =
        '<div style="color:var(--red);">Failed to load recent activity.</div>';
  }
}
