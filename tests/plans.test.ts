import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANS, dayIndex, planStatus, schedule } from "../src/lib/plans";

const counts: Record<string, number> = { PSA: 150, PRO: 31, MAT: 28, MRK: 16, LUK: 24, JHN: 21 };
const plan = (k: string) => PLANS.find((p) => p.key === k)!;

test("plans split chapters evenly and in order", () => {
  const ps = schedule(plan("psalms-30"), counts);
  assert.equal(ps.length, 30);
  assert.ok(ps.every((d) => d.length === 5));
  assert.deepEqual(ps[0], ["PSA.1", "PSA.2", "PSA.3", "PSA.4", "PSA.5"]);
  assert.equal(ps[29].at(-1), "PSA.150");
  const g = schedule(plan("gospels-30"), counts);
  assert.equal(g.flat().length, 89);
  assert.equal(g[0][0], "MAT.1");
  assert.equal(g.at(-1)!.at(-1), "JHN.21");
  assert.equal(schedule(plan("proverbs-31"), counts).every((d) => d.length === 1), true);
});

test("day index counts whole local days", () => {
  assert.equal(dayIndex("2026-10-01", "2026-10-01"), 0);
  assert.equal(dayIndex("2026-10-01", "2026-10-11"), 10);
  assert.equal(dayIndex("2026-12-31", "2027-01-01"), 1);
  assert.equal(dayIndex("2026-03-07", "2026-03-09"), 2); // across a DST change
});

test("status tracks today, behind and next unread", () => {
  const days = schedule(plan("proverbs-31"), counts);
  const s = planStatus(days, "2026-10-01", "2026-10-04", new Set(["PRO.1", "PRO.3"]));
  assert.equal(s.day, 3);
  assert.deepEqual(s.today, ["PRO.4"]);
  assert.equal(s.behind, 1); // PRO.2
  assert.equal(s.nextUnread, "PRO.2");
  assert.equal(s.done, 2);
  const late = planStatus(days, "2026-01-01", "2026-12-31", new Set(days.flat()));
  assert.equal(late.day, 30);
  assert.equal(late.finished, true);
});
