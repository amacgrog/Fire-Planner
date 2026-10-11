// plannerPath must fail with a clear message when the planner is neither built nor at the root.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plannerPath } = require('./helpers/planner-path');

const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-path-'));
try {
  assert.throws(() => plannerPath('Planner_US.html', empty), /npm run build/);
  fs.writeFileSync(path.join(empty, 'Planner_US.html'), '');
  assert.strictEqual(plannerPath('Planner_US.html', empty), path.join(empty, 'Planner_US.html'));
  fs.mkdirSync(path.join(empty, 'dist'));
  fs.writeFileSync(path.join(empty, 'dist', 'Planner_US.html'), '');
  assert.strictEqual(plannerPath('Planner_US.html', empty), path.join(empty, 'dist', 'Planner_US.html'));
} finally {
  fs.rmSync(empty, { recursive: true, force: true });
}
console.log('planner_path OK');
