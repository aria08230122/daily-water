import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_QUICK_AMOUNTS_ML,
  MAX_QUICK_AMOUNTS,
  normalizeQuickAmounts,
  validateQuickAmountDrafts,
} from "../src/lib/quick-amounts.ts";

test("old backups without quick amounts retain the original defaults", () => {
  for (const value of [undefined, null, {}, [], [0, -5, Infinity, "250"]]) {
    assert.deepEqual(normalizeQuickAmounts(value), [...DEFAULT_QUICK_AMOUNTS_ML]);
  }
});

test("valid custom amounts and their order survive JSON round trips", () => {
  const values = [420, 180, 650, 1000, 5000, 1];
  assert.deepEqual(normalizeQuickAmounts(JSON.parse(JSON.stringify(values))), values);
  assert.deepEqual(values, [420, 180, 650, 1000, 5000, 1]);
});

test("legacy fractional and duplicated values become unique whole-millilitre buttons", () => {
  assert.deepEqual(normalizeQuickAmounts([250.2, 250, NaN, 350, 5001, "500", 500]), [250, 350, 500]);
});

test("oversized imported preset lists are bounded to six buttons", () => {
  assert.deepEqual(normalizeQuickAmounts([100, 200, 300, 400, 500, 600, 700]), [100, 200, 300, 400, 500, 600]);
});

test("one or six custom amounts can be saved", () => {
  assert.deepEqual(validateQuickAmountDrafts([" 420 "]), { ok: true, amounts: [420] });
  assert.deepEqual(validateQuickAmountDrafts(["1", "200", "300", "400", "500", "5000"]), {
    ok: true, amounts: [1, 200, 300, 400, 500, 5000],
  });
});

test("invalid input is rejected instead of changing stored preferences", () => {
  for (const value of ["", " ", "0", "-1", "5001", "1.5", "abc", "Infinity"]) {
    const result = validateQuickAmountDrafts([value]);
    assert.equal(result.ok, false, value);
    assert.match(result.message, /1–5000/);
  }
});

test("duplicate amounts are rejected after numeric conversion", () => {
  const result = validateQuickAmountDrafts(["250", "0250"]);
  assert.equal(result.ok, false);
  assert.match(result.message, /重复/);
});

test("empty and oversized draft lists are rejected", () => {
  assert.equal(validateQuickAmountDrafts([]).ok, false);
  assert.equal(validateQuickAmountDrafts(Array.from({ length: MAX_QUICK_AMOUNTS + 1 }, (_, i) => String(i + 1))).ok, false);
});
