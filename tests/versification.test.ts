import { test } from "node:test";
import assert from "node:assert/strict";
import { draToNabre } from "../src/lib/bible/versification";

const map = (book: string, c: number, v: number) => {
  const r = draToNabre({ book, chapter: c, verse: v });
  return `${r.chapter}:${r.verse}`;
};

test("Psalms: Vulgate → Hebrew numbering", () => {
  const cases: [number, number, string][] = [
    [1, 1, "1:1"], [8, 10, "8:10"], [9, 21, "9:21"], [9, 22, "10:1"], [9, 39, "10:18"],
    [10, 1, "11:1"], [22, 1, "23:1"], [50, 3, "51:3"], [112, 9, "113:9"],
    [113, 8, "114:8"], [113, 9, "115:1"], [113, 26, "115:18"], [114, 9, "116:9"],
    [115, 10, "116:10"], [115, 19, "116:19"], [116, 2, "117:2"], [118, 176, "119:176"],
    [145, 10, "146:10"], [146, 11, "147:11"], [147, 12, "147:12"], [147, 20, "147:20"], [150, 6, "150:6"],
  ];
  for (const [c, v, want] of cases) assert.equal(map("PSA", c, v), want, `Ps ${c}:${v}`);
});

test("Joel and Malachi chapter breaks", () => {
  assert.equal(map("JOL", 2, 27), "2:27");
  assert.equal(map("JOL", 2, 28), "3:1");
  assert.equal(map("JOL", 2, 32), "3:5");
  assert.equal(map("JOL", 3, 21), "4:21");
  assert.equal(map("MAL", 3, 18), "3:18");
  assert.equal(map("MAL", 4, 1), "3:19");
  assert.equal(map("MAL", 4, 6), "3:24");
});

test("other books are unchanged", () => {
  assert.equal(map("JHN", 3, 16), "3:16");
  assert.equal(map("GEN", 1, 1), "1:1");
});
