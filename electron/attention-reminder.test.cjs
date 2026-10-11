// TASK-2382 — the reminder's rules, with a fake clock, fetch and store.

const { createAttentionReminder } = require("./attention-reminder.cjs");

function harness({ items = [], fail = false } = {}) {
  let clock = new Date(2026, 9, 12, 9, 5); // 2026-10-12 09:05 local
  let lastDay = null;
  const notes = [];
  const opened = [];
  const state = { items, fail };
  const reminder = createAttentionReminder({
    now: () => clock,
    fetchPending: async () => {
      if (state.fail) throw new Error("ECONNREFUSED");
      return state.items;
    },
    notify: (n) => notes.push(n),
    openDecide: () => opened.push("#/decide"),
    store: { getLastDay: () => lastDay, setLastDay: (d) => (lastDay = d) },
  });
  return {
    reminder,
    notes,
    opened,
    state,
    setClock: (d) => (clock = d),
    lastDay: () => lastDay,
  };
}

const THREE = [{ source: "activity-digest" }, { source: "improve" }, { source: "improve-note" }];

describe("attention reminder (TASK-2382)", () => {
  it("AC-1: 3 items (1 digest) at 09:05 → one reminder naming the digest; same day again → none", async () => {
    const h = harness({ items: THREE });
    expect(await h.reminder.tick()).toBe("reminded");
    expect(h.notes).toHaveLength(1);
    expect(h.notes[0].body).toBe("3 mục đang chờ anh quyết (1 từ daily digest)");

    h.setClock(new Date(2026, 9, 12, 15, 0));
    expect(await h.reminder.tick()).toBe("skipped:already-today");
    expect(h.notes).toHaveLength(1);
  });

  it("AC-1: count 0 → no reminder, and the day is not used up", async () => {
    const h = harness({ items: [] });
    expect(await h.reminder.tick()).toBe("skipped:nothing");
    expect(h.notes).toHaveLength(0);
    expect(h.lastDay()).toBeNull();
    // Items arrive later the same day → the later tick still reminds.
    h.state.items = [{ source: "improve" }];
    h.setClock(new Date(2026, 9, 12, 11, 0));
    expect(await h.reminder.tick()).toBe("reminded");
    expect(h.notes[0].body).toBe("1 mục đang chờ anh quyết");
  });

  it("AC-1: the next day with items → one reminder again", async () => {
    const h = harness({ items: THREE });
    await h.reminder.tick();
    h.setClock(new Date(2026, 9, 13, 9, 6));
    expect(await h.reminder.tick()).toBe("reminded");
    expect(h.notes).toHaveLength(2);
  });

  it("does not remind before 09:05 on a timer tick, but does at app start", async () => {
    const h = harness({ items: THREE });
    h.setClock(new Date(2026, 9, 12, 8, 30));
    expect(await h.reminder.tick()).toBe("skipped:too-early");
    expect(await h.reminder.tick({ startup: true })).toBe("reminded");
  });

  it("AC-2: clicking the notification opens #/decide", async () => {
    const h = harness({ items: THREE });
    await h.reminder.tick();
    h.notes[0].onClick();
    expect(h.opened).toEqual(["#/decide"]);
  });

  it("AC-3: an unreachable adapter raises nothing and does not mark the day", async () => {
    const h = harness({ items: THREE, fail: true });
    expect(await h.reminder.tick()).toBe("skipped:unreachable");
    expect(h.notes).toHaveLength(0);
    expect(h.lastDay()).toBeNull();
    h.state.fail = false;
    expect(await h.reminder.tick()).toBe("reminded");
  });
});
