#!/usr/bin/env node
// Builds dist/Planner_US.html and dist/Planner_Canada.html from src/.
//   node scripts/build.js            build once into dist/
//   node scripts/build.js --out DIR  write into DIR instead
const fs = require('fs');
const path = require('path');
const { assembleHtml } = require('./lib/assemble-html');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'dist');

const PLANNERS = [
  { dir: 'us', file: 'Planner_US.html' },
  { dir: 'canada', file: 'Planner_Canada.html' },
];
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

fs.mkdirSync(outDir, { recursive: true });
for (const { dir, file } of PLANNERS) {
  const src = path.join(root, 'src', dir);
  const html = assembleHtml({
    shell: read(path.join(src, 'index.html')),
    css: read(path.join(src, 'styles.css')),
    js: read(path.join(src, 'main.js')),
  });
  fs.writeFileSync(path.join(outDir, file), html);
}
fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
console.log(`built ${PLANNERS.length} planners into ${path.relative(root, outDir) || '.'}`);
