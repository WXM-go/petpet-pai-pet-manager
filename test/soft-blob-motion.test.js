const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('soft blob standard action frames keep a stable silhouette height', () => {
  const reviewPath = path.join(__dirname, '..', 'artifacts', 'soft-blob', 'qa', 'review.json');
  const review = JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
  for (const state of ['running', 'review']) {
    const row = review.rows.find((candidate) => candidate.state === state);
    assert.ok(row, `missing ${state} QA row`);
    const heights = row.frames.map((frame) => frame.bbox[3] - frame.bbox[1] + 1);
    const ratio = Math.min(...heights) / Math.max(...heights);
    assert.ok(ratio >= 0.75, `${state} silhouette height ratio ${ratio.toFixed(2)} is too uneven`);
  }
});
