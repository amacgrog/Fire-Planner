#!/usr/bin/env node
'use strict';
// Renames, merges and moves modules under src/ by a map (stage 4 design section 5.8).
//   node scripts/regroup-modules.js --map scripts/extractions/stage4-regroup.json [--dry-run] [--root DIR]
// The map is { "operations": [ { "rename": "<old>", "to": "<new>" }, { "merge": ["<a>", "<b>"], "to": "<path>" },
// { "move": "<name>", "from": "<path>", "to": "<path>" } ] }, applied in order. Prints one line per operation and
// `regroup: <n> operations, <m> files written`; writes nothing unless every operation and every guard passes. With
// --dry-run every line starts with `[dry run]` and nothing is written (m counts the files a real run would write).
// --root DIR runs on another tree (default: this repository). See scripts/lib/regroup.js.
const fs = require('fs');
const path = require('path');
const { regroup } = require('./lib/regroup');

const USAGE = 'usage: node scripts/regroup-modules.js --map <file> [--dry-run] [--root <dir>]';
const args = process.argv.slice(2);
let mapFile = null;
let root = path.join(__dirname, '..');
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run') dryRun = true;
  else if ((a === '--map' || a === '--root') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
    if (a === '--map') mapFile = args[++i];
    else root = path.resolve(args[++i]);
  } else {
    console.error(`${a.startsWith('--') ? `unknown or incomplete flag ${a}` : `unexpected argument ${a}`}\n${USAGE}`);
    process.exit(2);
  }
}
if (!mapFile) {
  console.error(USAGE);
  process.exit(2);
}
let operations;
try {
  operations = JSON.parse(fs.readFileSync(path.resolve(mapFile), 'utf8')).operations;
} catch (err) {
  console.error(`cannot read the map ${mapFile}: ${err.message}`);
  process.exit(2);
}
if (!Array.isArray(operations)) {
  console.error(`${mapFile}: "operations" must be an array\n${USAGE}`);
  process.exit(2);
}
const prefix = dryRun ? '[dry run] ' : '';
try {
  const report = regroup(root, operations, { dryRun });
  report.lines.forEach((l) => console.log(prefix + l));
  console.log(`${prefix}regroup: ${operations.length} operations, ${report.filesWritten} files written`);
} catch (err) {
  (err.lines || []).forEach((l) => console.log(prefix + l));
  console.error(`regroup refused, nothing was written: ${err.message}`);
  process.exit(1);
}
