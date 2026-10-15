#!/usr/bin/env node
// Builds dist/Planner_US.html and dist/Planner_Canada.html from src/.
//   node scripts/build.js              build once into dist/
//   node scripts/build.js --watch      rebuild whenever anything under src/ changes
//   node scripts/build.js --sourcemap  inline a source map (development; `npm run dev` uses it)
//   node scripts/build.js --minify     minify the script (not the default)
//   node scripts/build.js --out DIR    write into DIR instead of dist/
//   (shared code imports country code as '#country/<name>'; the build passes the planner's name as the esbuild condition)
const fs = require('fs');
const path = require('path');
const { assembleHtml } = require('./lib/assemble-html');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const outIdx = args.indexOf('--out');
const outDir = path.resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'dist');

const PLANNERS = [
  { dir: 'us', file: 'Planner_US.html' },
  { dir: 'canada', file: 'Planner_Canada.html' },
];
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// A classic (non-module) IIFE so the result runs from file:// in every browser.
async function bundleJs(entry, country) {
  const { build } = require('esbuild');
  const result = await build({
    entryPoints: [entry],
    outfile: path.join(outDir, 'main.js'), // never written (write: false); esbuild wants a name
    bundle: true,
    write: false,
    format: 'iife',
    target: 'esnext',
    conditions: [country],
    charset: 'utf8',
    banner: { js: '"use strict";' },
    minify: flag('--minify'),
    sourcemap: flag('--sourcemap') ? 'inline' : false,
    logLevel: 'warning',
  });
  return result.outputFiles[0].text;
}

// The shared HTML partials (src/shared/partials/<name>.html), keyed by name.
function readPartials() {
  const dir = path.join(root, 'src', 'shared', 'partials');
  return Object.fromEntries(
    fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), read(path.join(dir, f))]),
  );
}

async function buildAll() {
  fs.mkdirSync(outDir, { recursive: true });
  const css = read(path.join(root, 'src', 'shared', 'styles', 'styles.css'));
  const partials = readPartials();
  for (const { dir, file } of PLANNERS) {
    const src = path.join(root, 'src', dir);
    const html = assembleHtml({
      shell: read(path.join(src, 'index.html')),
      css,
      partials,
      js: await bundleJs(path.join(src, 'main.js'), dir),
    });
    fs.writeFileSync(path.join(outDir, file), html);
  }
  fs.copyFileSync(path.join(root, 'index.html'), path.join(outDir, 'index.html'));
  console.log(`built ${PLANNERS.length} planners into ${path.relative(root, outDir) || '.'}`);
}

if (flag('--watch')) {
  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => buildAll().catch((err) => console.error(err.message)), 50);
  };
  fs.watch(path.join(root, 'src'), { recursive: true }, rebuild);
  buildAll().catch((err) => console.error(err.message));
} else {
  buildAll().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
