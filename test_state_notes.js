// Ad-hoc UI check (not in npm test): every state shows its own note followed by the not-modeled line, and nothing
// overflows horizontally at 390x844.
//   node test_state_notes.js
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, 'Planner_US.html'));
  await page.waitForTimeout(400);
  for (const code of ['ca', 'ny', 'pa', 'ct', 'wa', 'tx', 'ma', 'fl', 'nm', 'dc']) {
    await page.selectOption('#stateTax', code);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({
      note: document.getElementById('stateTaxNote').innerText,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    assert.strictEqual(r.overflow, false, code + ': horizontal overflow at 390px');
    assert.ok(r.note.includes('Not modeled for any state'), code + ': not-modeled line (' + r.note.slice(0, 60) + ')');
    assert.ok(!r.note.includes('Simplified estimate'), code + ': no simplified-estimate line');
  }
  assert.deepStrictEqual(errors, [], 'page errors ' + errors);
  await browser.close();
  console.log('state notes: every state shows its own note; no overflow at 390px');
})().catch((e) => { console.error(e); process.exit(1); });
