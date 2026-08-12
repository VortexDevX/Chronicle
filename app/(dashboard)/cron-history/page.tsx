"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Clock3,
  History,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { apiRequest, getErrorMessage } from "@/lib/client/api";
import type {
  CronDeliveryState,
  CronHistoryItem,
  CronHistoryPayload,
} from "@/types/media";
import { relativeTime } from "@/utils/format";
import { PageLoader } from "@/components/PageLoader";
import styles from "./page.module.css";

const DELIVERY_LABELS: Record<CronDeliveryState, string> = {
  not_needed: "No alert needed",
  disabled: "Disabled",
  unavailable: "Unavailable",
  sent: "Sent",
  partial: "Partially sent",
  failed: "Failed",
  deferred: "Deferred",
};

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  return `${(durationMs / 1_000).toFixed(durationMs < 10_000 ? 1 : 0)}s`;
}

function DeliveryBadge({
  icon: Icon,
  label,
  state,
}: {
  icon: typeof Bell;
  label: string;
  state: CronDeliveryState;
}) {
  return (
    <span className={styles.delivery} data-state={state}>
      <Icon size={13} />
      {label}: {DELIVERY_LABELS[state]}
    </span>
  );
}

function CronRunCard({ item }: { item: CronHistoryItem }) {
  const runDate = new Date(item.started_at);
  return (
    <article className={styles.runCard} data-status={item.status}>
      <header>
        <span className={styles.runStatus}>
          {item.status === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          {item.status === "success" ? "Completed" : "Completed with issues"}
        </span>
        <time dateTime={item.started_at} title={runDate.toLocaleString()}>
          <Clock3 size={13} /> {relativeTime(item.started_at)} · {formatDuration(item.duration_ms)}
        </time>
      </header>

      <div className={styles.metrics}>
        <span><strong>{item.checked}/{item.selected}</strong><small>Checked</small></span>
        <span><strong>{item.updates_found}</strong><small>Updates</small></span>
        <span><strong>{item.tracker_failures}</strong><small>Failures</small></span>
        <span><strong>{item.deferred}</strong><small>Deferred</small></span>
      </div>

      <div className={styles.deliveries}>
        <DeliveryBadge icon={Bell} label="Telegram" state={item.telegram_delivery} />
        <DeliveryBadge icon={Smartphone} label="Android" state={item.push_delivery} />
      </div>

      {item.updates.length > 0 && (
        <div className={styles.details}>
          <span>Updates found</span>
          {item.updates.map((update) => (
            <div key={`${item._id}-${update.media_id}`}>
              <strong>{update.title}</strong>
              <small>{update.media_type} · {update.current} → {update.latest}</small>
            </div>
          ))}
        </div>
      )}

      {item.tracker_errors.length > 0 && (
        <div className={`${styles.details} ${styles.errors}`}>
          <span>Tracker errors</span>
          {item.tracker_errors.map((error, index) => (
            <div key={`${item._id}-error-${index}`}>
              <strong>{error.title}</strong>
              <small>{error.message}</small>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export default function CronHistoryPage() {
  const [payload, setPayload] = useState<CronHistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHistory = useCallback(async () => {
    setError("");
    try {
      setPayload(
        await apiRequest<CronHistoryPayload>("/api/cron/history", {
          cache: "no-store",
        }),
      );
    } catch (err) {
      setError(getErrorMessage(err, "Could not load cron history"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (loading && !payload) {
    return <PageLoader label="Loading cron history" detail="Reading recent tracker runs" compact />;
  }

  if (error && !payload) {
    return (
      <section className="state-panel state-error">
        <AlertTriangle size={24} />
        <h2>Cron history unavailable.</h2>
        <p>{error}</p>
        <button className="btn-primary" onClick={() => { setLoading(true); loadHistory(); }}>
          Try again
        </button>
      </section>
    );
  }

  const items = payload?.items || [];
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroIcon}><History size={21} /></div>
        <div>
          <span>Automation health</span>
          <h2>Recent cron runs</h2>
          <p>Only your tracker results appear here. Logs expire after {payload?.retention_days || 30} days.</p>
        </div>
        <button onClick={() => { setLoading(true); loadHistory(); }} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} /> Refresh
        </button>
      </section>

      {items.length > 0 ? (
        <section className={styles.runList} aria-label="Cron run history">
          {items.map((item) => <CronRunCard key={item._id} item={item} />)}
        </section>
      ) : (
        <section className="state-panel state-compact">
          <History size={22} />
          <h2>No cron runs recorded yet.</h2>
          <p>History appears after next scheduled tracker check touches one of your active entries.</p>
        </section>
      )}
    </div>
  );
}
