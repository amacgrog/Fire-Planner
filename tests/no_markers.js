// No `@@shared` marker anywhere in src/** (stage 4 design section 5.9): the region system is gone, shared code is written
// in src/shared/ directly. scripts/ and tests/ are not scanned. `--root DIR` checks another tree (used for the red run).
const fs = require('fs');
const path = require('path');

function allFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? allFiles(full) : [full];
  });
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--root');
const root = at >= 0 ? path.resolve(argv[at + 1]) : path.join(__dirname, '..');

const files = allFiles(path.join(root, 'src'));
const bad = [];
for (const f of files) {
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (l.includes('@@shared')) bad.push(`${path.relative(root, f)}:${i + 1}: ${l.trim()}`);
  });
}
if (bad.length) {
  console.error(bad.join('\n'));
  console.error(`no_markers FAILED (${bad.length} marker line${bad.length === 1 ? '' : 's'})`);
  process.exit(1);
}
console.log(`no_markers OK (${files.length} files)`);
