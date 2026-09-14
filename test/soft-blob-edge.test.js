const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('soft blob edge cleanup uses the strengthened matte-decontamination profile', () => {
  const reportPath = path.join(__dirname, '..', 'artifacts', 'soft-blob', 'qa', 'chroma-despill-extended.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(report.strength, 1);
  assert.equal(report.edge_radius, 8);
  assert.equal(report.spill_tolerance, 0.5);
  assert.equal(report.minimum_saturation, 0.05);
  assert.equal(report.alpha_preserved, true);
});
