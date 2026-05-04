const baseUrl = process.env.CRON_BASE_URL || "http://localhost:3000";
const cronSecret = process.env.CRON_SECRET;

async function main() {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/cron/checkChapters`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  const body = await res.text();
  process.stdout.write(`${res.status} ${res.statusText}\n${body}\n`);

  if (!res.ok) process.exitCode = 1;
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : "cron_check_failed"}\n`);
  process.exitCode = 1;
});
