import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRef, refHref } from "../src/lib/bible/refs";

test("parses common reference styles", () => {
  assert.deepEqual(parseRef("Jn 3:16"), { book: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(parseRef("John 3:16"), { book: "JHN", chapter: 3, verse: 16 });
  assert.deepEqual(parseRef("1 Cor 13:4-7"), { book: "1CO", chapter: 13, verse: 4, verseEnd: 7 });
  assert.deepEqual(parseRef("Gen 1"), { book: "GEN", chapter: 1 });
  assert.deepEqual(parseRef("Psalm 23:1"), { book: "PSA", chapter: 23, verse: 1 });
  assert.deepEqual(parseRef("1 Thess 5:17"), { book: "1TH", chapter: 5, verse: 17 });
  assert.deepEqual(parseRef("Sir 2:1"), { book: "SIR", chapter: 2, verse: 1 });
});

test("rejects non-references", () => {
  assert.equal(parseRef("foo 3:1"), null);
  assert.equal(parseRef("Mk"), null);
});

test("builds verse links", () => {
  assert.equal(refHref({ book: "GEN", chapter: 1, verse: 1 }), "/read/GEN/1#v-GEN-1-1");
  assert.equal(refHref({ book: "PSA", chapter: 23 }), "/read/PSA/23");
});
