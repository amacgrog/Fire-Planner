import { readFileSync } from 'node:fs';

// Values of the options of the US state selector (<select id="stateTax">), read from the planner's markup shell,
// for tests that compare the selector with the state-tax table (the old page read them from the DOM).
export function stateSelectorValues() {
  const html = readFileSync(new URL('../../../src/us/index.html', import.meta.url), 'utf8');
  const m = /<select id="stateTax">([\s\S]*?)<\/select>/.exec(html);
  if (!m) throw new Error('markup: #stateTax select not found');
  return [...m[1].matchAll(/<option value="([^"]*)"/g)].map((o) => o[1]);
}
