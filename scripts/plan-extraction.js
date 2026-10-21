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
// Values take the `--flag=value` form only; any other argument (a space-separated value, an unknown flag) exits 2 with the
// usage line, and an error while planning is printed as one line (no stack trace), exit 1.
const fs = require('fs');
const path = require('path');
const { planExtraction, draftTopics } = require('./lib/extraction-plan');

const USAGE = 'usage: node scripts/plan-extraction.js [--core-only] [--draft-topics] [--max-layer=N] [--max-batch=N] [--seam=a,b] [--topics=FILE] [--reserved=FILE]';
const SWITCHES = new Set(['--core-only', '--draft-topics']);
const NUMBERS = new Set(['--max-layer', '--max-batch']);
const VALUES = new Set(['--seam', '--topics', '--reserved']);
const usage = (msg) => {
  console.error(`${msg}\n${USAGE}`);
  process.exit(2);
};
const flags = new Map(); // flag -> value (true for a switch)
for (const a of process.argv.slice(2)) {
  const eq = a.indexOf('=');
  const flag = eq < 0 ? a : a.slice(0, eq);
  const val = eq < 0 ? null : a.slice(eq + 1);
  if (SWITCHES.has(flag) && val === null) flags.set(flag, true);
  else if (NUMBERS.has(flag) && val !== null && /^\d+$/.test(val)) flags.set(flag, Number(val));
  else if (VALUES.has(flag) && val) flags.set(flag, val);
  else if (SWITCHES.has(flag) || NUMBERS.has(flag) || VALUES.has(flag)) usage(`bad value for ${flag}: ${a}`);
  else usage(a.startsWith('--') ? `unknown flag ${a}` : `unexpected argument ${a}`);
}

try {
  const root = path.join(__dirname, '..');
  const namesFile = path.join(root, 'scripts', 'extractions', 'names.json');
  const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
  const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const options = { names, coreOnly: flags.has('--core-only') };
  if (flags.has('--seam')) options.seam = flags.get('--seam').split(',');
  if (flags.has('--max-layer')) options.maxLayer = flags.get('--max-layer');
  if (flags.has('--max-batch')) options.maxBatch = flags.get('--max-batch');
  if (flags.has('--reserved')) options.reservedNames = readJson(flags.get('--reserved'));
  let out;
  if (flags.has('--draft-topics')) out = draftTopics(root, options);
  else {
    const topics = flags.get('--topics');
    if (topics) options.topics = readJson(topics);
    out = planExtraction(root, options);
    // repo-relative with forward slashes, so the manifest is the same on every machine
    if (topics) out.topics = path.relative(root, path.resolve(topics)).split(path.sep).join('/');
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
} catch (err) {
  console.error(`plan-extraction failed: ${err.message}`);
  process.exit(1);
}
