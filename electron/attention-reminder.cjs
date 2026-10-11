// TASK-2382 — a once-a-day desktop reminder when automated sources left items
// for Butter to decide on. A decide screen (TASK-2381) is only seen when the
// app is opened; for three weeks the daily digest's ideas were never seen at
// all, so the app also says so on the desktop.
//
// Rules:
//   - at most ONE reminder per local calendar day;
//   - not before 09:05 (the digest writes at 09:00), except the check at app
//     start, which reminds straight away;
//   - nothing when the count is 0, and nothing when the adapter cannot be read —
//     neither marks the day, so a later tick that does find items still reminds;
//   - the body names the daily-digest count first, because that is the source
//     Butter asked to see most.
//
// Everything with a side effect is injected, so the rules are unit-tested with
// a fake clock, fetch and store (attention-reminder.test.cjs).

const REMIND_FROM_MINUTES = 9 * 60 + 5;

function localDay(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function reminderBody(items) {
  const digest = items.filter((i) => i.source === "activity-digest").length;
  const head = `${items.length} mục đang chờ anh quyết`;
  return digest > 0 ? `${head} (${digest} từ daily digest)` : head;
}

/**
 * @param {{
 *   fetchPending: () => Promise<Array<{ source: string }>>,
 *   notify: (n: { title: string, body: string, onClick: () => void }) => void,
 *   openDecide: () => void,
 *   now?: () => Date,
 *   store: { getLastDay: () => string | null, setLastDay: (day: string) => void },
 * }} deps
 */
function createAttentionReminder(deps) {
  const now = deps.now ?? (() => new Date());
  return {
    /** Returns "reminded" | "skipped:<why>" — the why is for tests and logs. */
    async tick({ startup = false } = {}) {
      const t = now();
      const day = localDay(t);
      if (deps.store.getLastDay() === day) return "skipped:already-today";
      if (!startup && t.getHours() * 60 + t.getMinutes() < REMIND_FROM_MINUTES) {
        return "skipped:too-early";
      }
      let items;
      try {
        items = await deps.fetchPending();
      } catch {
        return "skipped:unreachable";
      }
      if (!Array.isArray(items) || items.length === 0) return "skipped:nothing";
      deps.store.setLastDay(day);
      deps.notify({
        title: "Choda — cần anh quyết",
        body: reminderBody(items),
        onClick: deps.openDecide,
      });
      return "reminded";
    },
  };
}

/** A one-line JSON file under userData, so "already reminded today" survives a restart. */
function fileStore(fs, file) {
  return {
    getLastDay() {
      try {
        return JSON.parse(fs.readFileSync(file, "utf8")).lastDay ?? null;
      } catch {
        return null;
      }
    },
    setLastDay(day) {
      try {
        fs.writeFileSync(file, JSON.stringify({ lastDay: day }));
      } catch {
        // A failed write only means a possible second reminder after a restart.
      }
    },
  };
}

module.exports = { createAttentionReminder, fileStore, reminderBody, localDay, REMIND_FROM_MINUTES };
