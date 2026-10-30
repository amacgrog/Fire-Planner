// Runs every Playwright UI script at the repo root (`test_*.js`) against the built dist/, and fails if any fails.
// Not part of `npm test`: CI runs it as its own step (`npm run test:ui`, which builds first). Every root script is
// picked up by its name, so a new `test_foo.js` is in CI as soon as it is committed.
//   node tests/ui_scripts.js [--jobs N] [test_foo.js ...]
// Scripts run N at a time (default 2), each in its own Node process; a script in SERIAL asserts a wall-clock limit and runs
// afterwards, one at a time, so a parallel neighbour cannot slow it. None does at present (test_optimizer_ui.js, the last, went
// with the old optimizer in Batch 5 step 5).
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERIAL = new Set();

const args = process.argv.slice(2);
let jobs = 2;
const named = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--jobs') jobs = Math.max(1, Number(args[++i]) || 1);
  else named.push(path.basename(args[i]));
}
const all = fs.readdirSync(ROOT).filter((f) => /^test_.*\.js$/.test(f)).sort();
const missing = named.filter((f) => !all.includes(f));
if (missing.length) {
  console.error('ui_scripts: no such root script: ' + missing.join(', '));
  process.exit(1);
}
const scripts = named.length ? named : all;
if (!scripts.length) {
  console.error('ui_scripts: no test_*.js scripts at the repo root');
  process.exit(1);
}

function runOne(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [file], { cwd: ROOT });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code, signal) => {
      const r = { file, code, signal, secs: (Date.now() - t0) / 1000, out };
      console.log(`${code === 0 ? 'ok  ' : 'FAIL'} ${file} (${r.secs.toFixed(1)}s)`);
      if (code !== 0) console.log(out.replace(/^/gm, '    | '));
      resolve(r);
    });
  });
}

async function pool(files, n) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < files.length) results.push(await runOne(files[next++]));
  };
  await Promise.all(Array.from({ length: Math.min(n, files.length) }, worker));
  return results;
}

(async () => {
  const t0 = Date.now();
  const results = [
    ...(await pool(scripts.filter((f) => !SERIAL.has(f)), jobs)),
    ...(await pool(scripts.filter((f) => SERIAL.has(f)), 1)),
  ];
  const failed = results.filter((r) => r.code !== 0);
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nui_scripts: ${results.length - failed.length} of ${results.length} passed in ${wall}s` + (failed.length ? `; failed: ${failed.map((r) => r.file).join(', ')}` : ''));
  process.exit(failed.length ? 1 : 0);
})();
