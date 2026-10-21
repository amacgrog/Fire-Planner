import { LIST_MAX } from '../../../shared/core/lists-and-children.js';
import { itemGrowthFactor, lumpExpenseHits } from '../../../shared/core/spending-and-loans.js';
import { state } from '../../../shared/core/store.js';
import { medicalGrowth } from '../../../shared/core/year-factors.js';

  // This year's amounts from the add-as-you-go lists: recurring extra income
  // and extra expenses (active between their start and end age, growing with
  // inflation or their own rate), one-time income at an exact age, and lump
  // expenses (which may repeat). Ages are Partner A's.
  // E1b: this year's income streams split by owner and kind. Pure (reads no state): owner A in single-person mode, else
  // the stored owner (anything but 'B' is A); the window is tested on the owner's age. W-2 wages stop once the owner is
  // dead; income that is not earned moves to the survivor. `total` is one running sum in list order (the old
  // extraIncome expression, bit for bit). Contributing W-2 streams are listed for streamPlanContributions (E1b 5.4).
  export const STREAM_OUT = {
    total: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, selfA: 0, selfB: 0, premiumA: 0, premiumB: 0, coverA: false, coverB: false,
    contrib: { n: 0, items: Array.from({ length: LIST_MAX }, () => ({ owner: 0, pay: 0, stream: null })) },
  };
  export function streamAmountsForYear(streams, ctx, out) {
    out.total = 0; out.wagesA = 0; out.wagesB = 0; out.otherA = 0; out.otherB = 0; out.contrib.n = 0;
    out.selfA = 0; out.selfB = 0; out.premiumA = 0; out.premiumB = 0; out.coverA = false; out.coverB = false;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i],
        b = !ctx.single && s.owner === 'B',
        age = b ? ctx.ageB : ctx.ageA;
      if (!(age >= s.startAge && age <= s.endAge)) continue;
      const amount = s.amount * itemGrowthFactor(s, ctx.year, 'income', ctx.factor, ctx.incomeFactor),
        dead = b ? ctx.deadB : ctx.deadA;
      if (s.kind === 'wages' || s.kind === 'self') {
        if (dead) continue;
        if (s.kind === 'wages') {
          if (b) out.wagesB += amount; else out.wagesA += amount;
          // E1c: a W-2 stream with a health premium is its owner's employer coverage; the premium is pre-tax pay.
          if (s.healthPremium > 0) {
            const premium = s.healthPremium * ctx.premiumFactor;
            if (b) { out.premiumB += premium; out.coverB = true; } else { out.premiumA += premium; out.coverA = true; }
          }
        } else if (b) out.selfB += amount;
        else out.selfA += amount;
        if (s.contribute === true) {
          const it = out.contrib.items[out.contrib.n++];
          it.owner = b ? 1 : 0; it.pay = amount; it.stream = s;
        }
      } else if (b !== dead) out.otherB += amount; // owner B alive, or owner A dead: the money is B's
      else out.otherA += amount;
      out.total += amount;
    }
    return out;
  }
  // E1d: this year's one-time income split by kind and owner. Pure (reads no state). Any kind but wages, ordinary or gain is
  // tax-free and any owner but 'B' is A (rows may arrive unnormalized); owner A in single-person mode. A dead owner's
  // wages or ordinary income goes to the living partner as ordinary income (no payroll tax); a dead owner's gain is
  // tax-free (stepped-up basis); the owner is dead from the death year on. Only the gain share of a gain row is taxable;
  // its basis joins taxFree. flowTotal (the taxable part) is the one gate: a lump year is flowTotal > 0. taxFree runs from
  // 0 in list order: for all-free rows it is the old oneTimeAmount, bit for bit.
  // Rows of kind inheritedTrad / inheritedRoth (E1e) are skipped here: inheritedLedger reads them.
  export const LUMP_OUT = { taxFree: 0, wagesA: 0, wagesB: 0, otherA: 0, otherB: 0, gainA: 0, gainB: 0, gainNoNiitA: 0, gainNoNiitB: 0, flowTotal: 0 };
  export function lumpAmountsForYear(lumps, ctx, out) {
    out.taxFree = 0; out.wagesA = 0; out.wagesB = 0; out.otherA = 0; out.otherB = 0;
    out.gainA = 0; out.gainB = 0; out.gainNoNiitA = 0; out.gainNoNiitB = 0; out.flowTotal = 0;
    for (let i = 0; i < lumps.length; i++) {
      const o = lumps[i];
      if (Math.round(o.age) !== ctx.ageA) continue;
      const amt = o.amount * (o.flat ? 1 : ctx.factor),
        k = o.kind;
      // E1e: an inherited account is not a lump; the inherited ledger reads these rows (spec 5.2).
      if (k === 'inheritedTrad' || k === 'inheritedRoth') continue;
      if (k !== 'wages' && k !== 'ordinary' && k !== 'gain') {
        out.taxFree += amt;
        continue;
      }
      const b = !ctx.single && o.owner === 'B',
        dead = b ? ctx.deadB : ctx.deadA;
      if (k === 'gain') {
        if (dead) {
          out.taxFree += amt;
          continue;
        }
        const p = o.gainPct !== '' && o.gainPct !== null && Number.isFinite(Number(o.gainPct)) ? Math.min(100, Math.max(0, Number(o.gainPct))) : 100,
          g = (amt * p) / 100;
        if (b) out.gainB += g; else out.gainA += g;
        if (o.activeBusiness === true) { if (b) out.gainNoNiitB += g; else out.gainNoNiitA += g; }
        out.taxFree += amt - g;
        out.flowTotal += g;
      } else {
        if (k === 'wages' && !dead) { if (b) out.wagesB += amt; else out.wagesA += amt; }
        else if (b !== dead) out.otherB += amt; // owner B alive, or owner A dead: the money is B's
        else out.otherA += amt;
        out.flowTotal += amt;
      }
    }
    return out;
  }
  const STREAM_CTX = { ageA: 0, ageB: null, deadA: false, deadB: false, single: false, year: 0, factor: 1, incomeFactor: 1, premiumFactor: 1 };
  export function listAmountsForYear({ age, ageB, year, factor, incomeFactor, deadA, deadB, single }) {
    STREAM_CTX.ageA = age; STREAM_CTX.ageB = ageB; STREAM_CTX.deadA = deadA; STREAM_CTX.deadB = deadB;
    STREAM_CTX.single = single; STREAM_CTX.year = year; STREAM_CTX.factor = factor; STREAM_CTX.incomeFactor = incomeFactor;
    // (the premium's growth factor is a Math.pow: only worth computing when there is a stream to carry a premium)
    STREAM_CTX.premiumFactor = state.incomeSources.length ? factor * medicalGrowth(year) : 1;
    const streams = streamAmountsForYear(state.incomeSources, STREAM_CTX, STREAM_OUT),
      extraIncome = streams.total;
    const lumps = lumpAmountsForYear(state.oneTimeIncome, STREAM_CTX, LUMP_OUT),
      oneTimeAmount = lumps.taxFree;
    const extraExpense = state.extraExpenses
      .filter((e) => age >= e.startAge && age <= e.endAge)
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    const lumpExpense = state.lumpExpenses
      .filter((e) => lumpExpenseHits(e, age))
      .reduce((sum, e) => sum + e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor), 0);
    return { extraIncome, streams, lumps, oneTimeAmount, extraExpense, lumpExpense };
  }
  // E1c: which partners a W-2 stream with a health premium covers at the ages in ctx (bit 1: A, bit 2: B); the IRMAA
  // lookback asks it about the year two ahead. Same owner and window rules as streamAmountsForYear.
  export function streamCoverBits(streams, ctx) {
    let bits = 0;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (s.kind !== 'wages' || !(s.healthPremium > 0)) continue;
      const b = !ctx.single && s.owner === 'B',
        age = b ? ctx.ageB : ctx.ageA;
      if (!(age >= s.startAge && age <= s.endAge) || (b ? ctx.deadB : ctx.deadA)) continue;
      bits |= b ? 2 : 1;
    }
    return bits;
  }
  export const COVER_CTX = { ageA: 0, ageB: null, deadA: false, deadB: false, single: false };
