// An RRSP meltdown of bond-reserve money lands in the TFSA bond bucket (Canada, Batch 5 step 5b, owner ruling 1 of 2026-10-27).
//
// applyRrspMeltdown takes the meltdown from the pooled RRSP first, then from the RRSP bond bucket; the stock part lands in the
// TFSA (bal.roth) and the bond part in the TFSA bond bucket (bal.bondRoth), so the meltdown does not move the bond reserve into
// stocks. Every expected value is hand-computed.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function load() {
  const w = await world();
  return (await w.load('canada/core/withdrawals/rrsp-meltdown.js')).applyRrspMeltdown;
}

it('the bond part of a meltdown lands in bondRoth, the stock part in roth', async () => {
  const applyRrspMeltdown = await load();
  const bal = { traditional: 100, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRrspMeltdown(bal, 300);
  expect(bal).toStrictEqual({ traditional: 0, bondTraditional: 300, roth: 150, bondRoth: 220 });
});

it('a meltdown covered by the RRSP leaves both bond buckets alone', async () => {
  const applyRrspMeltdown = await load();
  const bal = { traditional: 100, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRrspMeltdown(bal, 60);
  expect(bal).toStrictEqual({ traditional: 40, bondTraditional: 500, roth: 110, bondRoth: 20 });
});

it('a meltdown of nothing changes nothing', async () => {
  const applyRrspMeltdown = await load();
  const bal = { traditional: 0, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRrspMeltdown(bal, 0);
  expect(bal).toStrictEqual({ traditional: 0, bondTraditional: 500, roth: 50, bondRoth: 20 });
});
