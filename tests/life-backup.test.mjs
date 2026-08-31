import assert from "node:assert/strict";
import test from "node:test";
import { BOWEL_STORAGE_KEY, addBowelEntry, emptyBowelStore, makeBowelEntry, startBowelSession } from "../src/lib/bowel-store.ts";
import { DEFAULT_STORE, STORAGE_KEY } from "../src/lib/water-store.ts";
import { createLifeBackup, parseLifeBackup, restoreLifeBackup } from "../src/lib/life-backup.ts";

const water = { ...DEFAULT_STORE, theme: "custom", customColor: "#A28CAA", dailyGoalMl: 1900, quickAmountsMl: [420, 180, 650, 1000], entries: [{ id: "water-1", amountMl: 420, drankAt: "2026-08-30T08:00:00Z" }] };
const bowel = addBowelEntry(emptyBowelStore(), makeBowelEntry("bowel-1", "2026-08-30T07:00:00Z"));
const exportedAt = "2026-08-30T10:00:00Z";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("a single full backup round-trips water, presets, themes and bowel records", () => {
  const backup = JSON.parse(JSON.stringify(createLifeBackup(water, bowel, exportedAt)));
  assert.deepEqual(parseLifeBackup(backup), { water, bowel });
  const storage = memoryStorage();
  restoreLifeBackup(storage, parseLifeBackup(backup));
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), water);
  assert.deepEqual(JSON.parse(storage.getItem(BOWEL_STORAGE_KEY)), bowel);
});

test("both raw and enveloped legacy water backups preserve all bowel data and active timers", () => {
  const running = startBowelSession(bowel, { id: "running", startedAt: exportedAt });
  for (const value of [water, { app: "daily-water", exportVersion: 1, data: water }]) {
    const storage = memoryStorage({ [BOWEL_STORAGE_KEY]: JSON.stringify(running) });
    const backup = parseLifeBackup(value);
    assert.equal(backup.bowel, null);
    restoreLifeBackup(storage, backup);
    assert.deepEqual(JSON.parse(storage.getItem(BOWEL_STORAGE_KEY)), running);
  }
});

test("older backups without custom preset preferences still get the original defaults", () => {
  const old = { ...water };
  delete old.quickAmountsMl;
  assert.deepEqual(parseLifeBackup(old).water.quickAmountsMl, [250, 350, 500]);
});

test("exporting does not copy unfinished timers to another device or clear the local timer", () => {
  const running = startBowelSession(bowel, { id: "running", startedAt: exportedAt });
  const backup = createLifeBackup(water, running, exportedAt);
  assert.equal(backup.bowel.activeSession, null);
  assert.deepEqual(backup.bowel.entries, bowel.entries);
  assert.equal(running.activeSession.id, "running");
});

test("full restore refuses to discard an in-progress timer", () => {
  const running = startBowelSession(bowel, { id: "running", startedAt: exportedAt });
  const original = { [STORAGE_KEY]: "old water bytes", [BOWEL_STORAGE_KEY]: JSON.stringify(running) };
  const storage = memoryStorage(original);
  assert.throws(() => restoreLifeBackup(storage, { water, bowel }), /先结束或取消/);
  for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);
});

test("invalid or incomplete combined backups cannot fall back to a partial water-only import", () => {
  for (const file of [
    { app: "other-app", exportVersion: 1, data: water },
    { app: "daily-water", exportVersion: 3, data: water, bowel },
    { app: "daily-water", exportVersion: 2, data: water },
    { app: "daily-water", exportVersion: 2, data: water, bowel: { version: 1, entries: [{ id: "bad" }] } },
    { app: "daily-water", exportVersion: 2, data: { version: 9 }, bowel },
  ]) assert.throws(() => parseLifeBackup(file));
});

test("quota failure on the second key rolls the first key back exactly", () => {
  const original = { [STORAGE_KEY]: JSON.stringify(DEFAULT_STORE), [BOWEL_STORAGE_KEY]: JSON.stringify(emptyBowelStore()) };
  const storage = memoryStorage(original);
  const write = storage.setItem;
  storage.setItem = (key, value) => { if (key === BOWEL_STORAGE_KEY) throw new Error("full"); write(key, value); };
  assert.throws(() => restoreLifeBackup(storage, { water, bowel }), /已恢复原有数据/);
  for (const [key, value] of Object.entries(original)) assert.equal(storage.getItem(key), value);
});

test("a failed first-time import leaves no phantom water key", () => {
  const storage = memoryStorage();
  const write = storage.setItem;
  storage.setItem = (key, value) => { if (key === BOWEL_STORAGE_KEY) throw new Error("full"); write(key, value); };
  assert.throws(() => restoreLifeBackup(storage, { water, bowel }));
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(BOWEL_STORAGE_KEY), null);
});

test("an unconfirmed rollback is reported honestly instead of claiming the original is restored", () => {
  const storage = memoryStorage({ [STORAGE_KEY]: "old", [BOWEL_STORAGE_KEY]: JSON.stringify(emptyBowelStore()) });
  const write = storage.setItem;
  storage.setItem = (key, value) => { if (key === BOWEL_STORAGE_KEY || value === "old") throw new Error("unavailable"); write(key, value); };
  assert.throws(() => restoreLifeBackup(storage, { water, bowel }), /无法确认回滚/);
});
