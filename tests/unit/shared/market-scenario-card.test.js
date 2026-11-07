// The market scenario card's settings (market-scenario-card.js): presets, the Great Depression shape conversion, defaults,
// clamps and the scenario they run; and previewSummaryText. Hand-written inputs and hand-computed literals.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const COUPLE = { ageA: 55, ageB: 53, singlePerson: false, lifeExpectancyA: 90, lifeExpectancyB: 95, retireAgeA: 62, returnRate: 7 };
const SINGLE = { ageA: 55, singlePerson: true, lifeExpectancyA: 90, retireAgeA: 62, returnRate: 7 };
// the couple's last age is 55 + max(35, 42) = 97, a single person's 55 + 35 = 90

async function setup() {
  const w = await world();
  const card = await w.load('shared/core/inputs/market-scenario-card.js');
  const { normalizeMarketScenario } = await w.load('shared/core/inputs/market-scenario.js');
  const { HIST } = await w.load('shared/core/projection/historical-data.js');
  return { ...card, normalizeMarketScenario, HIST };
}

const DEFAULT_CRASH = { age: 62, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, preset: '2008', presetShape: false, inflation: 0.1, bondReturn: 20.1 };

it('defaults for a couple and for a single person; the retirement age clamps into the plan', async () => {
  const S = await setup();
  expect(S.defaultCardSettings(COUPLE)).toStrictEqual({
    kind: 'crash',
    order: 'bucket',
    crash: DEFAULT_CRASH,
    history: { startYear: 2000, atAge: 62, endAge: null },
  });
  expect(S.defaultCardSettings(SINGLE)).toStrictEqual(S.defaultCardSettings(COUPLE));
  // retiring after the plan's last age (90) reads 90; before the current age reads the current age
  const late = S.defaultCardSettings({ ...SINGLE, retireAgeA: 95 });
  expect(late.crash.age).toBe(90);
  expect(late.history.atAge).toBe(90);
  expect(S.defaultCardSettings({ ...SINGLE, retireAgeA: 40 }).crash.age).toBe(55);
});

it('the HIST export years are the data first and last years', async () => {
  const S = await setup();
  expect(S.HIST_FIRST_YEAR).toBe(1928);
  expect(S.HIST_LAST_YEAR).toBe(S.HIST.at(-1)[0]);
});

it('garbage gives the defaults: a string, null, a wrong kind, an array, a JSON string', async () => {
  const S = await setup();
  const d = S.defaultCardSettings(COUPLE);
  for (const bad of ['garbage', null, undefined, { kind: 'x' }, [], 5, JSON.stringify(d)]) {
    expect(S.normalizeCardSettings(bad, COUPLE)).toStrictEqual(d);
  }
  // the result is always a fresh object, never the defaults' own
  const a = S.normalizeCardSettings(null, COUPLE);
  a.crash.age = 99;
  expect(S.normalizeCardSettings(null, COUPLE).crash.age).toBe(62);
});

it('the clamps: ages into the plan, endAge above atAge, a blank endAge stays null', async () => {
  const S = await setup();
  const n = (raw) => S.normalizeCardSettings(raw, COUPLE);
  expect(n({ crash: { age: 40 } }).crash.age).toBe(55);
  expect(n({ crash: { age: 200 } }).crash.age).toBe(97);
  expect(n({ crash: { age: '70' } }).crash.age).toBe(70);
  expect(n({ history: { atAge: 20 } }).history.atAge).toBe(55);
  expect(n({ history: { atAge: 120 } }).history.atAge).toBe(97);
  expect(n({ history: { atAge: 60, endAge: 60 } }).history.endAge).toBe(61);
  expect(n({ history: { atAge: 60, endAge: 30 } }).history.endAge).toBe(61);
  expect(n({ history: { atAge: 60, endAge: 500 } }).history.endAge).toBe(98);
  expect(n({ history: { atAge: 60, endAge: 70 } }).history.endAge).toBe(70);
  expect(n({ history: { atAge: 60, endAge: null } }).history.endAge).toBe(null);
  expect(n({ history: { atAge: 60, endAge: '' } }).history.endAge).toBe(null);
  expect(n({ history: { atAge: 60 } }).history.endAge).toBe(null);
  // the single person's last age is 90
  expect(S.normalizeCardSettings({ crash: { age: 95 } }, SINGLE).crash.age).toBe(90);
  // numbers take the normalizer's ranges
  const c = n({ crash: { drop: 100, fallYears: 0, recoverPct: 150, recoverYears: 99, inflation: -40, bondReturn: 80 } }).crash;
  expect([c.drop, c.fallYears, c.recoverPct, c.recoverYears, c.inflation, c.bondReturn]).toStrictEqual([95, 1, 100, 30, -15, 50]);
  expect(n({ history: { startYear: 1900 } }).history.startYear).toBe(1928);
  expect(n({ history: { startYear: 3000 } }).history.startYear).toBe(S.HIST_LAST_YEAR);
  // kind and order: only the two values each
  expect(n({ kind: 'history', order: 'standard' })).toMatchObject({ kind: 'history', order: 'standard' });
  expect(n({ kind: 'plan', order: 'x' })).toMatchObject({ kind: 'crash', order: 'bucket' });
  // a bad field keeps its default; the good ones around it are taken
  expect(n({ crash: { age: 'x', drop: 20 } }).crash).toStrictEqual({ ...DEFAULT_CRASH, drop: 20 });
});

it('recoverPct 0 keeps recoverYears, and the scenario passes both through', async () => {
  const S = await setup();
  const s = S.normalizeCardSettings({ crash: { recoverPct: 0, recoverYears: 7 } }, COUPLE);
  expect(s.crash.recoverPct).toBe(0);
  expect(s.crash.recoverYears).toBe(7);
  const raw = S.cardSettingsToScenario(s);
  expect(raw.crashes[0].recoverPct).toBe(0);
  expect(raw.crashes[0].recoverYears).toBe(7);
  expect(S.normalizeMarketScenario(raw).crashes[0].recoverYears).toBe(7);
});

it("a preset id stands only while its rates are the preset's own; presetShape is a boolean", async () => {
  const S = await setup();
  const n = (crash) => S.normalizeCardSettings({ crash }, COUPLE).crash;
  expect(n({ preset: '2008' }).preset).toBe('2008');
  expect(n({ preset: '2008', inflation: 0.1, bondReturn: 20.1 }).preset).toBe('2008');
  expect(n({ preset: '2008', inflation: 1 }).preset).toBe('custom');
  expect(n({ preset: '2008', bondReturn: 20 }).preset).toBe('custom');
  expect(n({ preset: '2022', inflation: 6.5, bondReturn: -17.8 }).preset).toBe('2022');
  expect(n({ preset: 'custom' }).preset).toBe('custom');
  expect(n({ preset: 'nonsense' }).preset).toBe('2008');
  expect(n({ presetShape: true }).presetShape).toBe(true);
  expect(n({ presetShape: 'yes' }).presetShape).toBe(false);
  expect(n({ presetShape: 1 }).presetShape).toBe(false);
});

it('CRASH_PRESETS is the cited list, frozen, in order', async () => {
  const S = await setup();
  expect(S.CRASH_PRESETS).toStrictEqual([
    { id: '1929', label: 'Like 1929–32', inflation: -6.4, bondReturn: 3.7, fallFrom: 1929, fallTo: 1932, recoverTo: 1944 },
    { id: '1973', label: 'Like 1973–74', inflation: 10.5, bondReturn: 2.8, fallFrom: 1973, fallTo: 1974, recoverTo: 1976 },
    { id: '2000', label: 'Like 2000–02', inflation: 2.4, bondReturn: 12.5, fallFrom: 2000, fallTo: 2002, recoverTo: 2006 },
    { id: '2008', label: 'Like 2008', inflation: 0.1, bondReturn: 20.1, fallFrom: 2008, fallTo: 2008, recoverTo: 2012 },
    { id: '2022', label: 'Like 2022', inflation: 6.5, bondReturn: -17.8, fallFrom: 2022, fallTo: 2022, recoverTo: 2023 },
  ]);
  expect(Object.isFrozen(S.CRASH_PRESETS)).toBe(true);
  expect(S.CRASH_PRESETS.every((p) => Object.isFrozen(p))).toBe(true);
});

it('the cited HIST rows hold the cited values', async () => {
  const S = await setup();
  const rows = (a, b) => S.HIST.filter((r) => r[0] >= a && r[0] <= b);
  expect(rows(1929, 1932).map((r) => r[2])).toStrictEqual([0.58, -6.4, -9.32, -10.27]);
  expect(rows(1929, 1932).map((r) => r[3])).toStrictEqual([4.2, 4.54, -2.56, 8.79]);
  expect(rows(1973, 1974).map((r) => r[2])).toStrictEqual([8.71, 12.34]);
  expect(rows(1973, 1974).map((r) => r[3])).toStrictEqual([3.66, 1.99]);
  expect(rows(2000, 2002).map((r) => r[2])).toStrictEqual([3.39, 1.55, 2.38]);
  expect(rows(2000, 2002).map((r) => r[3])).toStrictEqual([16.66, 5.57, 15.12]);
  expect(rows(2008, 2008)).toStrictEqual([[2008, -36.55, 0.11, 20.1, 4.1]]);
  expect(rows(2022, 2022)).toStrictEqual([[2022, -18.04, 6.45, -17.83, 1.47]]);
});

it('presetCrashShape at a 7% return', async () => {
  const S = await setup();
  const shape = (id, r) => S.presetCrashShape(S.CRASH_PRESETS.find((p) => p.id === id), r);
  expect(shape('1929', 7)).toStrictEqual({ drop: 73, fallYears: 4, recoverPct: 17, recoverYears: 12 });
  expect(shape('1973', 7)).toStrictEqual({ drop: 45, fallYears: 2, recoverPct: 60, recoverYears: 2 });
  expect(shape('2000', 7)).toStrictEqual({ drop: 49, fallYears: 3, recoverPct: 33, recoverYears: 4 });
  expect(shape('2008', 7)).toStrictEqual({ drop: 41, fallYears: 1, recoverPct: 45, recoverYears: 4 });
  expect(shape('2022', 7)).toStrictEqual({ drop: 23, fallYears: 1, recoverPct: 58, recoverYears: 1 });
});

it('presetCrashShape clamps: a 12% return gives the Depression no recovery, a 0% return a full one', async () => {
  const S = await setup();
  const shape = (id, r) => S.presetCrashShape(S.CRASH_PRESETS.find((p) => p.id === id), r);
  // the real recovery is slower than the plan's own line at 12%, so the recovery clamps at 0
  expect(shape('1929', 12)).toStrictEqual({ drop: 78, fallYears: 4, recoverPct: 0, recoverYears: 12 });
  // at 0% the index got back above its old level, so the recovery clamps at 100
  expect(shape('2008', 0)).toStrictEqual({ drop: 37, fallYears: 1, recoverPct: 100, recoverYears: 4 });
});

it("a shape preset turns Custom, numbers kept, when the plan's return changes", async () => {
  const S = await setup();
  const crash = { preset: '1929', presetShape: true, inflation: -6.4, bondReturn: 3.7, drop: 73, fallYears: 4, recoverPct: 17, recoverYears: 12 };
  const at = (returnRate) => S.normalizeCardSettings({ crash }, { ...COUPLE, returnRate }).crash;
  expect(at(7)).toStrictEqual({ ...crash, age: 62 });
  expect(at(6)).toStrictEqual({ ...crash, age: 62, preset: 'custom' });
  // without the shape checkbox the preset only names the rates, whatever the return
  expect(S.normalizeCardSettings({ crash: { ...crash, presetShape: false } }, { ...COUPLE, returnRate: 6 }).crash.preset).toBe('1929');
});

it('cardSettingsToScenario for both kinds and both orders, through normalizeMarketScenario', async () => {
  const S = await setup();
  const base = S.defaultCardSettings(COUPLE);
  const crashRaw = { kind: 'crash', order: 'bucket', crashes: [{ age: 62, drop: 35, fallYears: 2, recoverPct: 60, recoverYears: 4, inflation: 0.1, bondReturn: 20.1 }] };
  expect(S.cardSettingsToScenario(base)).toStrictEqual(crashRaw);
  expect(S.normalizeMarketScenario(S.cardSettingsToScenario(base))).toStrictEqual(crashRaw);
  const std = { ...base, order: 'standard' };
  expect(S.normalizeMarketScenario(S.cardSettingsToScenario(std))).toStrictEqual({ ...crashRaw, order: 'standard' });
  const hist = { ...base, kind: 'history', history: { startYear: 2008, atAge: 60, endAge: 70 } };
  const histRaw = { kind: 'history', order: 'bucket', history: { startYear: 2008, atAge: 60, endAge: 70 } };
  expect(S.cardSettingsToScenario(hist)).toStrictEqual(histRaw);
  expect(S.normalizeMarketScenario(S.cardSettingsToScenario(hist))).toStrictEqual(histRaw);
  const histStd = { ...hist, order: 'standard', history: { startYear: 2008, atAge: 60, endAge: null } };
  expect(S.normalizeMarketScenario(S.cardSettingsToScenario(histStd))).toStrictEqual({ kind: 'history', order: 'standard', history: { startYear: 2008, atAge: 60, endAge: null } });
});

it('previewSummaryText: both depleted, only the scenario depleted, neither', async () => {
  const w = await world();
  const { previewSummaryText } = await w.load('shared/core/format/market-scenario-preview-text.js');
  const fmt = (n) => '$' + n;
  expect(previewSummaryText({ scenDepletedAge: 82, baseDepletedAge: 90, lastAge: 95, scenEnd: 0, baseEnd: 5 }, fmt)).toBe(
    "Lasts to age 82 instead of age 90 · ends with $0 instead of $5 (today's $)",
  );
  expect(previewSummaryText({ scenDepletedAge: 82, baseDepletedAge: null, lastAge: 95, scenEnd: 0, baseEnd: 7 }, fmt)).toBe(
    "Lasts to age 82 instead of age 95+ · ends with $0 instead of $7 (today's $)",
  );
  expect(previewSummaryText({ scenDepletedAge: null, baseDepletedAge: null, lastAge: 95, scenEnd: 3, baseEnd: 7 }, fmt)).toBe(
    "Lasts to age 95+ in both · ends with $3 instead of $7 (today's $)",
  );
  // the same depleted age in both is also "in both"
  expect(previewSummaryText({ scenDepletedAge: 88, baseDepletedAge: 88, lastAge: 95, scenEnd: 0, baseEnd: 0 }, fmt)).toBe(
    "Lasts to age 88 in both · ends with $0 instead of $0 (today's $)",
  );
});
