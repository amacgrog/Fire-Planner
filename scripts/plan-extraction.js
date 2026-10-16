#!/usr/bin/env node
'use strict';
// Prints the extraction plan (the manifest of modules and their batches) as JSON.
//   node scripts/plan-extraction.js [--max-layer=N] [--max-batch=N] [--core-only] > scripts/extractions/<stage>.json
// --max-layer: only units this many layers above a leaf or lower (default: no limit).
// --max-batch: modules deeper than this share the last batch (default 2).
// --seam=a,b: country units that shared modules may import through their facades, #country/core/seam-<name> (the same names in both planners).
// --core-only: leave every unit that touches the DOM, or depends on one, in main.js.
// --topics=<file>: the stage 4 topics file (statements, runs and wiring functions); the manifest then names it under "topics".
// --reserved=<file>: a JSON array of names a wiring function may not take (the base bundles' top-level names).
// --draft-topics: print a draft topics file (design section 5.1 defaults) instead of a plan.
// Module names can be overridden in scripts/extractions/names.json: "shared:<region>" or "<country>:<first unit label>".
const fs = require('fs');
const path = require('path');
const { planExtraction, draftTopics } = require('./lib/extraction-plan');

const root = path.join(__dirname, '..');
const namesFile = path.join(root, 'scripts', 'extractions', 'names.json');
const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
const number = (flag) => {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? Number(arg.split('=')[1]) : undefined;
};
const text = (flag) => {
  const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
  return arg ? arg.slice(flag.length + 1) : undefined;
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const options = { names, coreOnly: process.argv.includes('--core-only') };
const seamArg = process.argv.find((a) => a.startsWith('--seam='));
if (seamArg) options.seam = seamArg.split('=')[1].split(',');
if (number('--max-layer') !== undefined) options.maxLayer = number('--max-layer');
if (number('--max-batch') !== undefined) options.maxBatch = number('--max-batch');
if (text('--reserved')) options.reservedNames = readJson(text('--reserved'));
let out;
if (process.argv.includes('--draft-topics')) out = draftTopics(root, options);
else {
  if (text('--topics')) options.topics = readJson(text('--topics'));
  out = planExtraction(root, options);
  // repo-relative with forward slashes, so the manifest is the same on every machine
  if (text('--topics')) out.topics = path.relative(root, path.resolve(text('--topics'))).split(path.sep).join('/');
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
