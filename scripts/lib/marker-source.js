'use strict';
// Finds the source file that holds a `// NAME:begin ... // NAME:end` data block (STATE_RULES, PROVINCE_RULES, ...)
// under src/<country>/, wherever it lives (main.js, or a module once the block was extracted), and returns its text
// with any leading `export ` removed so the block can be evaluated as a plain script.
const fs = require('fs');
const path = require('path');

function listJsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

function findMarkerSource(root, country, name) {
  const begin = new RegExp(`^\\s*// ${name}:begin\\s*$`, 'm');
  const hits = listJsFiles(path.join(root, 'src', country)).filter((file) => begin.test(fs.readFileSync(file, 'utf8')));
  if (hits.length !== 1) {
    throw new Error(`expected exactly one file under src/${country}/ with "// ${name}:begin", found ${hits.length}`);
  }
  const text = fs.readFileSync(hits[0], 'utf8').replace(/\r\n/g, '\n').replace(/^(\s*)export /gm, '$1');
  return { file: path.relative(root, hits[0]).split(path.sep).join('/'), text };
}

module.exports = { findMarkerSource };
