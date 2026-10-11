// Checks the files `npm run build` wrote to dist/ (plain Node, no browser).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dist = path.resolve(__dirname, '..', 'dist');

for (const name of ['Planner_US.html', 'Planner_Canada.html']) {
  const file = path.join(dist, name);
  assert.ok(fs.existsSync(file), `${name} is missing from dist/ (run npm run build)`);
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(!html.includes('{{css}}') && !html.includes('{{js}}'), `${name}: build placeholders left in the output`);
  assert.ok(!/<script[^>]*type=["']module["']/i.test(html), `${name}: must be a classic script, not a module`);
  assert.ok(!/<script[^>]*\ssrc=/i.test(html), `${name}: must not load an external script`);
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, `${name}: expected exactly one inline <script>`);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]), `${name}: the inline script does not parse`);
}
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'index.html is missing from dist/');
console.log('build output OK');
