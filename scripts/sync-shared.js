#!/usr/bin/env node
// Keeps the code shared by the US and Canada planner sources (src/us/*, src/canada/*) identical.
//
// Each shared region sits between marker lines in both files:
//     // @@shared:<name> begin          (inside the <script>)
//     /* @@shared:<name> begin */       (inside the <style>)
//     <!-- @@shared:<name> begin -->    (in the markup)
//     ...
//     ... @@shared:<name> end ...
// and shared/<name>.js | .css | .html is the canonical copy of what lies
// between them (the extension follows the marker style). Names are unique
// across all three styles.
//
//   node scripts/sync-shared.js          rewrite the regions in both planners
//                                        from shared/*.js
//   node scripts/sync-shared.js --check  exit 1 if any region differs from its
//                                        fragment (run in `npm test` and CI)
//   node scripts/sync-shared.js --pull <file>
//                                        copy the regions from one planner back
//                                        into shared/ (use after editing a
//                                        region in place), then sync the other
//
// Nothing here is needed to RUN a planner; the HTML files stay self-contained.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
// Only the planner scripts carry shared regions now: the stylesheet and the HTML partials are build-time
// includes (src/shared/styles, src/shared/partials), and shared script code is moving into modules.
const KINDS = ['main.js'];
const PLANNERS = ['us', 'canada'].flatMap((dir) => KINDS.map((kind) => `src/${dir}/${kind}`));
const SHARED_DIR = path.join(root, 'shared');
const MARK = /^\s*(?:\/\/|\/\*|<!--) @@shared:(\S+) (begin|end)(?: \*\/| -->)?\s*$/;
const EXT = { '//': 'js', '/*': 'css', '<!--': 'html' };

// Returns [{ name, start, end }] with start/end = line indexes of the content
// (between the markers, exclusive of them).
function findRegions(lines, file) {
  const regions = [];
  let open = null;
  lines.forEach((line, i) => {
    const m = MARK.exec(line);
    if (!m) return;
    const [, name, kind] = m;
    if (kind === 'begin') {
      if (open) throw new Error(`${file}:${i + 1}: "${name}" begins inside "${open.name}"`);
      open = { name, start: i + 1, ext: EXT[line.trim().split(' ')[0]] };
    } else {
      if (!open || open.name !== name) throw new Error(`${file}:${i + 1}: unmatched end for "${name}"`);
      regions.push({ name, start: open.start, end: i, ext: open.ext });
      open = null;
    }
  });
  if (open) throw new Error(`${file}: region "${open.name}" never ends`);
  return regions;
}

const fragmentPath = (r) => path.join(SHARED_DIR, `${r.name}.${r.ext}`);
const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const readFragment = (r) => readText(fragmentPath(r)).replace(/\n$/, '').split('\n');

const args = process.argv.slice(2);
const check = args.includes('--check');
const pullIdx = args.indexOf('--pull');
const pullFile = pullIdx >= 0 ? (args[pullIdx + 1] || '').replace(/\\/g, '/') : null;
if (pullIdx >= 0 && !PLANNERS.includes(pullFile)) {
  console.error(`--pull needs one of: ${PLANNERS.join(', ')}`);
  process.exit(2);
}

const loaded = PLANNERS.map((file) => {
  const lines = readText(path.join(root, file)).split('\n');
  return { file, lines, regions: findRegions(lines, file) };
});

const names = new Set(loaded.flatMap((p) => p.regions.map((r) => r.name)));
const problems = [];
for (const kind of KINDS) {
  const group = loaded.filter((p) => p.file.endsWith(`/${kind}`));
  const groupNames = new Set(group.flatMap((p) => p.regions.map((r) => r.name)));
  for (const p of group) {
    const have = new Set(p.regions.map((r) => r.name));
    for (const n of groupNames) if (!have.has(n)) problems.push(`${p.file}: missing region "${n}"`);
  }
}

// A marker line with a comment line directly above and below it splits one comment block in two (a comment line is
// a // line that is not itself a marker). Keep the marker above or below the whole block.
const isCommentLine = (line) => line !== undefined && /^\s*\/\//.test(line) && !MARK.test(line);
for (const p of loaded) {
  p.lines.forEach((line, i) => {
    const m = MARK.exec(line);
    if (m && isCommentLine(p.lines[i - 1]) && isCommentLine(p.lines[i + 1])) {
      problems.push(`marker between comments: ${p.file}:${i + 1} (${m[1]})`);
    }
  });
}

if (pullFile) {
  const src = loaded.find((p) => p.file === pullFile);
  fs.mkdirSync(SHARED_DIR, { recursive: true });
  for (const r of src.regions) fs.writeFileSync(fragmentPath(r), src.lines.slice(r.start, r.end).join('\n') + '\n');
}

let drifted = 0;
for (const p of loaded) {
  // Rewrite from the bottom up so earlier line indexes stay valid.
  for (const r of [...p.regions].reverse()) {
    if (!fs.existsSync(fragmentPath(r))) { problems.push(`${path.relative(root, fragmentPath(r))} is missing`); continue; }
    const want = readFragment(r);
    const have = p.lines.slice(r.start, r.end);
    if (want.join('\n') === have.join('\n')) continue;
    drifted++;
    if (check) console.error(`${p.file}: region "${r.name}" differs from shared/${r.name}.${r.ext}`);
    else p.lines.splice(r.start, r.end - r.start, ...want);
  }
  if (!check) fs.writeFileSync(path.join(root, p.file), p.lines.join('\n'));
}

problems.forEach((m) => console.error(m));
if (check) {
  if (drifted || problems.length) {
    console.error('Shared code has drifted. Edit shared/* (or edit one planner and run `npm run sync -- --pull <file>`), then run `npm run sync`.');
    process.exit(1);
  }
  console.log(`shared regions OK (${names.size} regions x 2 planners)`);
} else {
  if (problems.length) process.exit(1);
  console.log(`synced ${names.size} regions${drifted ? `, updated ${drifted}` : ', no changes'}`);
}
