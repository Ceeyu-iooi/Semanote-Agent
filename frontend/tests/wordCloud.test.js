import assert from "node:assert/strict";
import test from "node:test";
import { placeWords } from "../src/wordCloud.js";

test("word cloud keeps the dominant word centered and packs within a narrow canvas", () => {
  const words = Array.from({ length: 24 }, (_, index) => ({ size: 54 - index }));
  const layout = placeWords(words, 260, word => word.size * 4);
  assert.deepEqual([layout.words[0].x, layout.words[0].y], [0, 0]);
  for (const [index, word] of layout.words.entries()) {
    assert.ok(Math.abs(word.x) + word.w / 2 <= 130);
    assert.ok(Math.abs(word.y) + word.h / 2 <= layout.height / 2);
    for (const earlier of layout.words.slice(0, index)) {
      assert.ok(Math.abs(word.x - earlier.x) >= (word.w + earlier.w) / 2 ||
        Math.abs(word.y - earlier.y) >= (word.h + earlier.h) / 2);
    }
  }
});
