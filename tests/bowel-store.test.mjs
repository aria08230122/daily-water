import assert from "node:assert/strict";
import test from "node:test";
import {
  BOWEL_STORAGE_KEY, addBowelEntry, cancelBowelSession, dateTimeInputValue,
  elapsedSeconds, emptyBowelStore, finishBowelSession, formatElapsed, localDayKey,
  makeBowelEntry, normalizeBowelEntry, normalizeBowelStore, readBowelStore,
  setNoBowelDay, startBowelSession, updateBowelEntry, writeBowelStore,
} from "../src/lib/bowel-store.ts";

process.env.TZ = "Asia/Shanghai";
const start = "2026-08-30T15:58:40.125Z";
const end = "2026-08-30T16:02:10.125Z";
const session = { id: "session-1", startedAt: start };

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("an unused bowel store loads without writing to existing storage", () => {
  const storage = memoryStorage({ "daily-water/store-v1": "existing water" });
  assert.deepEqual(readBowelStore(storage), emptyBowelStore());
  assert.equal(storage.getItem(BOWEL_STORAGE_KEY), null);
  assert.equal(storage.getItem("daily-water/store-v1"), "existing water");
});

test("quick records have no invented duration or default health details", () => {
  const record = makeBowelEntry("quick-1", start);
  const store = addBowelEntry(emptyBowelStore(), record);
  assert.equal(store.entries.length, 1);
  for (const field of ["endedAt", "shape", "effort", "color", "amount", "pain"]) assert.equal(record[field], null);
  assert.equal(record.notes, "");
  assert.equal(store.activeSession, null);
});

test("start persists only a running session, and repeated start cannot reset it", () => {
  const initial = emptyBowelStore();
  const running = startBowelSession(initial, session);
  assert.equal(initial.activeSession, null);
  assert.equal(running.entries.length, 0);
  assert.deepEqual(startBowelSession(running, { id: "another", startedAt: end }), running);
});

test("elapsed time survives reload and background suspension using wall-clock timestamps", () => {
  const storage = memoryStorage();
  writeBowelStore(storage, startBowelSession(emptyBowelStore(), session));
  const reloaded = readBowelStore(storage);
  assert.deepEqual(reloaded.activeSession, session);
  assert.equal(elapsedSeconds(reloaded.activeSession.startedAt, Date.parse(start) + 7_215_000), 7215);
  assert.equal(formatElapsed(7215), "02:00:15");
  assert.equal(elapsedSeconds(start, Date.parse(start) - 1000), 0);
});

test("finish creates exactly one completed record before any optional details exist", () => {
  const running = startBowelSession(emptyBowelStore(), session);
  const finished = finishBowelSession(running, session.id, end);
  assert.equal(finished.activeSession, null);
  assert.equal(finished.entries.length, 1);
  assert.equal(finished.entries[0].endedAt, end);
  assert.equal(finished.entries[0].source, "timer");
  assert.equal(finished.entries[0].color, null);
  assert.equal(running.activeSession.id, session.id);
  const duplicate = finishBowelSession(finished, session.id, "2026-08-30T16:20:00Z");
  assert.deepEqual(duplicate, finished);
  assert.throws(() => startBowelSession(finished, session), /已经完成/);
});

test("cross-midnight timing keeps its real duration and belongs to the start day", () => {
  const finished = finishBowelSession(startBowelSession(emptyBowelStore(), session), session.id, end);
  const entry = finished.entries[0];
  assert.equal(localDayKey(new Date(entry.startedAt)), "2026-08-30");
  assert.equal(localDayKey(new Date(entry.endedAt)), "2026-08-31");
  assert.equal(elapsedSeconds(entry.startedAt, Date.parse(entry.endedAt)), 210);
  assert.equal(dateTimeInputValue(entry.startedAt), "2026-08-30T23:58:40");
});

test("a clock moving backwards cannot silently produce a negative finished duration", () => {
  const running = startBowelSession(emptyBowelStore(), session);
  assert.throws(() => finishBowelSession(running, session.id, "2026-08-30T15:00:00Z"), /结束时间不能早于/);
  assert.deepEqual(running.activeSession, session);
});

test("cancel drops only the selected session and never adds a history item", () => {
  const original = addBowelEntry(emptyBowelStore(), makeBowelEntry("old", "2026-08-29T02:00:00Z"));
  const running = startBowelSession(original, session);
  assert.throws(() => cancelBowelSession(running, "stale-session"), /状态已经变化/);
  assert.deepEqual(cancelBowelSession(running, session.id), original);
});

test("unknown, none and recorded day states remain distinct", () => {
  const initial = emptyBowelStore();
  const marked = setNoBowelDay(initial, "2026-08-30", true);
  assert.deepEqual(initial.noBowelDays, []);
  assert.deepEqual(marked.noBowelDays, ["2026-08-30"]);
  const recorded = addBowelEntry(marked, makeBowelEntry("new", start));
  assert.deepEqual(recorded.noBowelDays, []);
  assert.throws(() => setNoBowelDay(recorded, "2026-08-30", true), /已经有记录/);
  assert.throws(() => setNoBowelDay(startBowelSession(initial, session), "2026-08-30", true), /结束或取消/);
  assert.deepEqual(setNoBowelDay(marked, "2026-08-30", false), initial);
  assert.throws(() => setNoBowelDay(initial, "2026-02-30", true), /日期无效/);
});

test("optional details, multiline notes and corrected timestamps survive JSON storage", () => {
  const entry = makeBowelEntry("entry", start);
  const initial = addBowelEntry(emptyBowelStore(), entry);
  const updated = { ...entry, shape: 4, effort: "easy", color: "brown", amount: "medium", pain: "none", notes: "午饭后\n补充记录 <script>只是文字</script>", updatedAt: end };
  const changed = updateBowelEntry(initial, updated, entry.updatedAt);
  const storage = memoryStorage();
  writeBowelStore(storage, changed);
  assert.deepEqual(readBowelStore(storage), changed);
  assert.equal(initial.entries[0].notes, "");
  assert.throws(() => updateBowelEntry(changed, entry, entry.updatedAt), /其他页面更新/);
  assert.throws(() => updateBowelEntry(emptyBowelStore(), updated, entry.updatedAt), /已经被删除/);
});

test("correcting a record date clears a conflicting no-bowel marker", () => {
  const entry = makeBowelEntry("entry", start);
  const state = setNoBowelDay(addBowelEntry(emptyBowelStore(), entry), "2026-08-29", true);
  const edited = updateBowelEntry(state, { ...entry, startedAt: "2026-08-29T12:00:00Z", updatedAt: end }, entry.updatedAt);
  assert.deepEqual(edited.noBowelDays, []);
});

test("malformed imports are rejected whole instead of silently dropping records", () => {
  const entry = makeBowelEntry("valid", start);
  for (const broken of [
    { ...entry, shape: 8 }, { ...entry, pain: "guess" }, { ...entry, notes: "x".repeat(2001) },
    { ...entry, source: "timer", endedAt: null }, { ...entry, startedAt: "not-a-date" },
    { ...entry, endedAt: "2025-01-01T00:00:00Z" },
  ]) {
    assert.equal(normalizeBowelEntry(broken), null);
    assert.equal(normalizeBowelStore({ ...emptyBowelStore(), entries: [entry, broken] }), null);
  }
  assert.equal(normalizeBowelStore({ ...emptyBowelStore(), entries: [entry, entry] }), null);
  assert.equal(normalizeBowelStore({ ...emptyBowelStore(), version: 2 }), null);
});

test("invalid local data is left intact, and failed writes do not consume an active timer", () => {
  const broken = memoryStorage({ [BOWEL_STORAGE_KEY]: "not JSON" });
  assert.throws(() => readBowelStore(broken));
  assert.equal(broken.getItem(BOWEL_STORAGE_KEY), "not JSON");
  const running = startBowelSession(emptyBowelStore(), session);
  const storage = memoryStorage({ [BOWEL_STORAGE_KEY]: JSON.stringify(running) });
  storage.setItem = () => { throw new Error("Storage full"); };
  assert.throws(() => writeBowelStore(storage, finishBowelSession(running, session.id, end)), /Storage full/);
  assert.deepEqual(readBowelStore(storage), running);
});

test("already-completed session IDs cannot resurrect a running timer from a file", () => {
  const finished = finishBowelSession(startBowelSession(emptyBowelStore(), session), session.id, end);
  assert.equal(normalizeBowelStore({ ...finished, activeSession: session }).activeSession, null);
});

test("very long elapsed time remains readable without resetting at 24 hours", () => {
  assert.equal(formatElapsed(90_000), "25:00:00");
  assert.equal(formatElapsed(360_005), "4天 04:00:05");
});
