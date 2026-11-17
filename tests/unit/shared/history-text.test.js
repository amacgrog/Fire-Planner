// The historical backtest in words: the rounded-down success percent and the count of starting years that ran out.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

const TEXT = 'shared/core/format/history-text.js';

it('successPercent rounds down and never reads 100 after a failure', async () => {
  const w = await world();
  const { successPercent } = await w.load(TEXT);
  const T = [[1, 100], [0.995, 99], [0.8, 80], [0.796, 79], [0.79, 79], [0.29, 29], [0, 0], [55 / 70, 78], [56 / 70, 80]];
  for (const [rate, want] of T) expect(successPercent(rate)).toBe(want);
});

it('failedYearsText gives the exact count', async () => {
  const w = await world();
  const { failedYearsText } = await w.load(TEXT);
  expect(failedYearsText(1, 70)).toBe('1 of the 70 historical starting years with a full record');
  expect(failedYearsText(22, 70)).toBe('22 of the 70 historical starting years with a full record');
  expect(failedYearsText(70, 70)).toBe('every one of the 70 historical starting years with a full record');
});
