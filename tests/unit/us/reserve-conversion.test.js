// A Roth conversion of bond-reserve money lands in the Roth bond bucket (US, Batch 5 step 5b, owner ruling 1 of 2026-10-27).
//
// applyRothConversion takes the conversion from stock traditional first, then from the traditional bond bucket; the stock part
// lands in Roth stocks and the bond part in Roth bonds, so a conversion is a tax event and not a move from the bond reserve
// into stocks. The ledgers work on the pools (traditional + bondTraditional, roth + bondRoth), so they do not see the split.
// Every expected value is hand-computed.
import { it, expect } from 'vitest';
import { world } from '../helpers/world.js';

async function setup() {
  const w = await world();
  const st = await w.setState({ tradIraA: 600, trad401kA: 0, tradIraB: 0, trad401kB: 0, rothIraA: 70, roth401kA: 0, rothIraB: 0, roth401kB: 0 });
  const { applyRothConversion } = await w.load('us/core/withdrawals/roth-conversion.js');
  const { accountsNew } = await w.load('us/core/accounts/account-ledger.js');
  const { rothAccountsNew } = await w.load('us/core/accounts/roth-ledger.js');
  return { st, applyRothConversion, accountsNew, rothAccountsNew };
}

it('the bond part of a conversion lands in bondRoth, the stock part in roth', async () => {
  const { st, applyRothConversion, accountsNew, rothAccountsNew } = await setup();
  const bal = { traditional: 100, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRothConversion(bal, rothAccountsNew(st), accountsNew(st), 300, 0, false);
  expect(bal).toStrictEqual({ traditional: 0, bondTraditional: 300, roth: 150, bondRoth: 220 });
});

it('a conversion covered by stock traditional leaves both bond buckets alone', async () => {
  const { st, applyRothConversion, accountsNew, rothAccountsNew } = await setup();
  const bal = { traditional: 100, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRothConversion(bal, rothAccountsNew(st), accountsNew(st), 60, 0, false);
  expect(bal).toStrictEqual({ traditional: 40, bondTraditional: 500, roth: 110, bondRoth: 20 });
});

it('a conversion of nothing changes nothing', async () => {
  const { st, applyRothConversion, accountsNew, rothAccountsNew } = await setup();
  const bal = { traditional: 0, bondTraditional: 500, roth: 50, bondRoth: 20 };
  applyRothConversion(bal, rothAccountsNew(st), accountsNew(st), 0, 0, false);
  expect(bal).toStrictEqual({ traditional: 0, bondTraditional: 500, roth: 50, bondRoth: 20 });
});

it('the ledgers see only the pools: the same pools split differently give the same ledgers', async () => {
  const { st, applyRothConversion, accountsNew, rothAccountsNew } = await setup();
  const run = (bal) => {
    const accts = accountsNew(st),
      roth = rothAccountsNew(st);
    applyRothConversion(bal, roth, accts, 300, 0, false);
    return { accts, roth };
  };
  // Pools: traditional 600, Roth 70 in both.
  expect(run({ traditional: 100, bondTraditional: 500, roth: 50, bondRoth: 20 })).toStrictEqual(
    run({ traditional: 600, bondTraditional: 0, roth: 70, bondRoth: 0 }),
  );
});
