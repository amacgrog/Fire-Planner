#!/usr/bin/env node
'use strict';
// Moves the units of one batch of an extraction plan out of src/<country>/main.js into modules.
//   node scripts/extract-units.js --manifest scripts/extractions/stage2.json --batch 0 [--dry-run]
// Writes nothing unless every check passes. See scripts/lib/extract-units.js.
const fs = require('fs');
const path = require('path');
const { applyModules } = require('./lib/extract-units');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const value = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const manifestFile = value('--manifest');
const batch = Number(value('--batch'));
if (!manifestFile || Number.isNaN(batch)) {
  console.error('usage: node scripts/extract-units.js --manifest <file> --batch <n> [--dry-run]');
  process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(path.resolve(root, manifestFile), 'utf8'));
const modules = manifest.modules.filter((m) => m.batch === batch);
if (!modules.length) {
  console.error(`no modules in batch ${batch}`);
  process.exit(2);
}
const dryRun = args.includes('--dry-run');
try {
  const report = applyModules(root, modules, { dryRun, seam: manifest.seam || [] });
  console.log(`${dryRun ? '[dry run] ' : ''}batch ${batch}: ${report.modules.length} modules; units moved: us ${report.moved.us}, canada ${report.moved.canada}`);
  if (report.deletedRegions.length) console.log(`regions removed: ${report.deletedRegions.join(', ')}`);
  if (report.seam.us.length) console.log('seam names: ' + report.seam.us.join(', '));
  if (report.wiring.length) console.log('wiring functions: ' + report.wiring.map((w) => w.name).join(', '));
  report.warnings.forEach((w) => console.log(`warning: ${w}`));
} catch (err) {
  console.error(`extraction failed, nothing was written: ${err.message}`);
  process.exit(1);
}
