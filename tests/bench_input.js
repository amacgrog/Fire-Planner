// Slider responsiveness per chart view (responsiveness proposal, PR B). Not part of `npm test`
// (wall-clock numbers are machine-dependent); run it on a "before" build and on the working tree and compare.
//
//   node tests/bench_input.js [--root DIR] [--planner us|canada|both] [--steps 8] [--drag 20] [--views proj,hist,mc]
//
// For each planner, chart view (projection, historical, Monte Carlo at 1,000 paths) and card setting (every result
// card closed, every card open), on a fresh page load (so the result cache starts empty):
//   - step: the synchronous time of one slider `input` event to a value not seen before (median and p90 of `steps`
//     steps, each after a settle so every debounced pass has finished);
//   - drag: `drag` input events, one per animation frame, as a pointer drag delivers them: the median and the longest
//     frame-to-frame gap, and the total time (a responsive drag keeps the gaps near one frame, about 17 ms);
//   - release: the synchronous time of the `change` event that ends the drag (the slider released).
// The slider is k401PctA (US) or rrspPctA (Canada). Uses only the DOM, so the same script times old and new builds.

const { chromium } = require('playwright');
const { plannerPath } = require('./helpers/planner-path');
const path = require('path');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(__dirname, '..')));
const PLANNERS = opt('--planner', 'both') === 'both' ? ['us', 'canada'] : [opt('--planner')];
const STEPS = Number(opt('--steps', 8));
const DRAG = Number(opt('--drag', 20));
const VIEWS = opt('--views', 'proj,hist,mc').split(',');
const SETTLE_MS = 900;
const FILE = { us: 'Planner_US.html', canada: 'Planner_Canada.html' };
const SLIDER = { us: 'k401PctA', canada: 'rrspPctA' };
const VIEW_BTN = { proj: 'chartGroupProjectionBtn', hist: 'chartGroupHistBtn', mc: 'chartGroupMcBtn' };

const pctl = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x) => x.toFixed(1).padStart(7);

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  console.log(`root ${ROOT}`);
  console.log('planner view cards |  step med   p90 |  drag med   max   total | release   [ms]');
  for (const planner of PLANNERS) {
    for (const view of VIEWS) {
      for (const open of [false, true]) {
        const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
        page.on('pageerror', (e) => errors.push(`${planner} ${view}: ${e.message}`));
        await page.goto('file://' + plannerPath(FILE[planner], ROOT));
        await page.waitForTimeout(400);
        await page.evaluate(({ btn, open }) => {
          document.getElementById(btn).click();
          if (open) document.querySelectorAll('details.result-card').forEach((d) => { if (!d.hidden) d.open = true; });
        }, { btn: VIEW_BTN[view], open });
        await page.waitForTimeout(SETTLE_MS);
        const id = SLIDER[planner];
        // Values 10, 11, ... for the steps and 50, 51, ... for the drag: never a value seen before on this page.
        const steps = [];
        for (let i = 0; i <= STEPS; i++) {
          const ms = await page.evaluate(({ id, v }) => {
            const el = document.getElementById(id);
            el.value = String(v);
            const t0 = performance.now();
            el.dispatchEvent(new Event('input', { bubbles: true }));
            const t = performance.now() - t0;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return t;
          }, { id, v: 10 + i });
          if (i > 0) steps.push(ms); // the first step warms the code up
          await page.waitForTimeout(view === 'proj' ? SETTLE_MS : SETTLE_MS + 1500);
        }
        const drag = await page.evaluate(({ id, n }) => new Promise((resolve) => {
          const el = document.getElementById(id), stamps = [];
          let i = 0;
          const frame = (ts) => {
            stamps.push(performance.now());
            if (i === n) {
              const t0 = performance.now();
              el.dispatchEvent(new Event('change', { bubbles: true }));
              resolve({ stamps, release: performance.now() - t0 });
              return;
            }
            el.value = String(50 + i++);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        }), { id, n: DRAG });
        const gaps = drag.stamps.slice(1).map((t, i) => t - drag.stamps[i]);
        const total = drag.stamps.at(-1) - drag.stamps[0];
        console.log(`${planner.padEnd(7)} ${view.padEnd(4)} ${(open ? 'open' : 'closed').padEnd(6)}|${f(pctl(steps, 0.5))}${f(pctl(steps, 0.9))} |${f(pctl(gaps, 0.5))}${f(Math.max(...gaps))}${f(total)} |${f(drag.release)}`);
        await page.context().close();
      }
    }
  }
  await browser.close();
  if (errors.length) { console.log('page errors:\n' + errors.join('\n')); process.exit(1); }
})();
