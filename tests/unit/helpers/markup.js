import { readFileSync } from 'node:fs';

// Values of the options of the US state selector (<select id="stateTax">), read from the planner's markup shell,
// for tests that compare the selector with the state-tax table (the old page read them from the DOM).
export function stateSelectorValues() {
  const html = readFileSync(new URL('../../../src/us/index.html', import.meta.url), 'utf8');
  const m = /<select id="stateTax">([\s\S]*?)<\/select>/.exec(html);
  if (!m) throw new Error('markup: #stateTax select not found');
  return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((o) => o[1]);
}

// The registry entry (type, min, max) of one number field of the US FIELDS registry, read from its source
// (src/us/ui/inputs/fields.js is a ui/ module, which a unit test never imports). The old test fed the real entry to
// mcpAccepts; this reads the same entry's bounds from the entry's own line.
export function usNumberFieldEntry(key) {
  const text = readFileSync(new URL('../../../src/us/ui/inputs/fields.js', import.meta.url), 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.includes("{ key: '" + key + "',"));
  if (!line) throw new Error('markup: FIELDS entry ' + key + ' not found');
  const type = /type: '(\w+)'/.exec(line);
  if (!type || type[1] !== 'number') throw new Error('markup: FIELDS entry ' + key + ' is not a number field');
  const count = (ch) => line.split(ch).length - 1;
  if (count('{') !== count('}')) throw new Error('markup: FIELDS entry ' + key + ' is not closed on its line');
  const entry = { key, type: 'number' };
  for (const bound of ['min', 'max']) {
    const m = new RegExp('\\b' + bound + ': (-?[\\d.]+)').exec(line);
    if (m) entry[bound] = Number(m[1]);
    else if (new RegExp('\\b' + bound + '\\s*:').test(line)) throw new Error('markup: FIELDS entry ' + key + ' has a ' + bound + ' that is not a number literal');
  }
  return entry;
}
