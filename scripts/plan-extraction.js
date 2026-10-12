#!/usr/bin/env node
'use strict';
// Prints the extraction plan (the manifest of modules and their batches) as JSON.
//   node scripts/plan-extraction.js [--max-layer=3] > scripts/extractions/stage2.json
// Module names can be overridden in scripts/extractions/names.json: "shared:<region>" or "<country>:<first unit label>".
const fs = require('fs');
const path = require('path');
const { planExtraction } = require('./lib/extraction-plan');

const root = path.join(__dirname, '..');
const namesFile = path.join(root, 'scripts', 'extractions', 'names.json');
const names = fs.existsSync(namesFile) ? JSON.parse(fs.readFileSync(namesFile, 'utf8')) : {};
const layerArg = process.argv.find((a) => a.startsWith('--max-layer='));
const plan = planExtraction(root, { maxLayer: layerArg ? Number(layerArg.split('=')[1]) : 3, names });
process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
