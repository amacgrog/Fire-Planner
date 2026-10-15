import { LIST_MAX } from '../../shared/core/lists-and-children.js';
import { itemGrowthFactor, lumpExpenseHits } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';
import { medicalGrowth } from '../../shared/core/year-factors.js';
import { singleLifeFactor } from './niit-and-rmd.js';

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
  // ---- E1e: inherited traditional and Roth IRA / 401(k) accounts (spec sections 6.1, 6.2) ----
  // One inherited row's draw (traditional) or payout (Roth) in draw year k. b = start-of-year balance, r = the year's stock
  // return, L = the heir's Single Life factor in the year after receipt. A 10-year row: traditional even over the years left
  // with the RMD on L as a floor and the account as a cap; Roth whole in year 10. A stretch row (death before 2020, decision
  // 17): the RMD alone, both kinds. k < 1: nothing.
  export function inheritedDraw(b, r, k, L, roth, stretch) {
    if (k < 1 || !(b > 0)) return 0;
    const grown = b * (1 + r);
    const d = L - k + 1;
    if (stretch) return d <= 1 ? grown : Math.min(grown, b / d);
    if (roth) return k >= 10 ? grown : 0;
    if (k >= 10 || d <= 1) return grown;
    return Math.min(grown, Math.max(grown / (11 - k), b / d));
  }
  // The ledger of a run: one slot per inherited row (null for every legacy state). Arrays of length n, oldest receipt first.
  // owner[] is the named owner (0 = A, 1 = B), heir[] the heir slot at receipt (the other partner when the owner is dead then).
  export function inheritedLedger(rows, ctx) {
    const kept = [];
    for (let i = 0; i < rows.length; i++) {
      const o = rows[i];
      if (o.kind !== 'inheritedTrad' && o.kind !== 'inheritedRoth') continue;
      const receiptYear = Math.round(o.age) - ctx.ageA,
        stretch = ctx.currentYear + receiptYear < 2020;
      if (!stretch && receiptYear + 10 < 0) continue; // a 10-year window that has already closed
      const owner = !ctx.single && o.owner === 'B' ? 1 : 0,
        ownerDead = receiptYear >= ctx.deathYear && (owner === 0 ? ctx.deceasedIsA : ctx.deceasedIsB),
        heir = ownerDead ? 1 - owner : owner,
        heirAge = (heir === 0 ? ctx.ageA : ctx.ageB) + receiptYear + 1;
      kept.push({ i, o, receiptYear, stretch, owner, heir, L: singleLifeFactor(heirAge) });
    }
    if (kept.length === 0) return null;
    kept.sort((a, b) => a.receiptYear - b.receiptYear || a.i - b.i);
    const n = kept.length;
    const inh = {
      n, roth: [], owner: [], heir: [], receiptYear: [], stretch: [], L: [], deadline: [], openAmount: [], flat: [],
      bal: new Float64Array(n), open: new Uint8Array(n), draw: new Float64Array(n), lastResort: new Float64Array(n), slot: new Int8Array(n), post: new Int8Array(n),
      snapBal: new Float64Array(n), snapOpen: new Uint8Array(n), snapDraw: new Float64Array(n), snapLastResort: new Float64Array(n), snapDeadline: new Array(n), snapL: new Array(n),
    };
    for (let j = 0; j < n; j++) {
      const k = kept[j];
      inh.roth.push(k.o.kind === 'inheritedRoth');
      inh.owner.push(k.owner);
      inh.heir.push(k.heir);
      inh.receiptYear.push(k.receiptYear);
      inh.stretch.push(k.stretch);
      inh.L.push(k.L);
      inh.deadline.push(k.stretch ? Infinity : k.receiptYear + 10);
      inh.openAmount.push(k.o.amount);
      inh.flat.push(k.o.flat === true);
      inh.slot[j] = k.heir;
      if (k.receiptYear < 0) {
        inh.open[j] = 1;
        inh.bal[j] = k.o.amount;
      }
    }
    return inh;
  }
  export const INH_OUT = { drawA: 0, drawB: 0, rothPayout: 0, any: false };
  export const INH_CTX = { year: 0, stockReturn: 0, deadA: false, deadB: false, collapse: false };
  // This year's scheduled draws and payouts, from the balances at the start of the year (known before the MAGI iteration, so
  // per-year constants like the RMD). Never opens a row (inheritedApply does). drawA/drawB are on PRE-remap slots: the slot of the
  // row's current heir, the other partner once the heir is dead. ctx = { year, stockReturn, deadA, deadB }.
  export function inheritedYear(inh, ctx, out) {
    out.drawA = 0; out.drawB = 0; out.rothPayout = 0; out.any = false;
    inh.draw.fill(0);
    for (let i = 0; i < inh.n; i++) {
      if (inh.open[i] === 0) continue;
      const heir = inh.heir[i],
        heirDead = heir === 0 ? ctx.deadA : ctx.deadB,
        slot = heirDead ? 1 - heir : heir;
      inh.slot[i] = slot;
      inh.post[i] = ctx.collapse ? 0 : slot; // the post-remap profile slot: a one-person return reads only slot A
      let draw;
      if (inh.stretch[i] && inh.deadline[i] === Infinity) {
        draw = inheritedDraw(inh.bal[i], ctx.stockReturn, ctx.year - inh.receiptYear[i], inh.L[i], inh.roth[i], true);
        // The heir's first dead year is still a stretch year; from the next the 10 years run from it, with the heir's factor continued.
        if (heirDead) {
          inh.deadline[i] = ctx.year + 10;
          inh.L[i] -= ctx.year - inh.receiptYear[i];
        }
      } else {
        const k = ctx.year - (inh.deadline[i] - 10);
        draw = inheritedDraw(inh.bal[i], ctx.stockReturn, k, inh.L[i], inh.roth[i], false);
      }
      inh.draw[i] = draw;
      if (inh.roth[i]) out.rothPayout += draw;
      else if (slot === 0) out.drawA += draw;
      else out.drawB += draw;
    }
    return out;
  }
  // Grows each open slot at the year's stock return, takes its draw, closes an emptied slot and opens this year's future rows (after
  // growth, so a row opened this year neither grows nor draws); re-sums bal.inheritedTrad / bal.inheritedRoth and sets out.any.
  export function inheritedApply(inh, bal, stockReturn, factor, year) {
    let any = false, trad = 0, roth = 0;
    for (let i = 0; i < inh.n; i++) {
      if (inh.open[i] === 1) {
        if (inh.draw[i] > 0) any = true;
        inh.bal[i] = inh.bal[i] * (1 + stockReturn) - inh.draw[i];
        if (inh.bal[i] <= 0 || year >= inh.deadline[i]) {
          inh.bal[i] = 0;
          inh.open[i] = 0;
        }
      } else if (year === inh.receiptYear[i]) {
        inh.open[i] = 1;
        inh.bal[i] = inh.openAmount[i] * (inh.flat[i] ? 1 : factor);
        // The row opens after inheritedYear skipped it: give it this year's slot and post-remap slot the way inheritedYear does.
        const heir = inh.heir[i], slot = (heir === 0 ? INH_CTX.deadA : INH_CTX.deadB) ? 1 - heir : heir;
        inh.slot[i] = slot;
        inh.post[i] = INH_CTX.collapse ? 0 : slot;
      }
      if (inh.open[i] === 1) {
        any = true;
        if (inh.roth[i]) roth += inh.bal[i];
        else trad += inh.bal[i];
      }
    }
    bal.inheritedTrad = trad;
    bal.inheritedRoth = roth;
    INH_OUT.any = any;
  }
  // The MAGI iteration's snapshot of the ledger (preallocated: nothing is allocated per year).
  export function inheritedClone(inh) {
    for (let i = 0; i < inh.n; i++) {
      inh.snapBal[i] = inh.bal[i]; inh.snapOpen[i] = inh.open[i]; inh.snapDraw[i] = inh.draw[i];
      inh.snapLastResort[i] = inh.lastResort[i]; inh.snapDeadline[i] = inh.deadline[i]; inh.snapL[i] = inh.L[i];
    }
    return inh;
  }
  export function inheritedRestore(inh) {
    for (let i = 0; i < inh.n; i++) {
      inh.bal[i] = inh.snapBal[i]; inh.open[i] = inh.snapOpen[i]; inh.draw[i] = inh.snapDraw[i];
      inh.lastResort[i] = inh.snapLastResort[i]; inh.deadline[i] = inh.snapDeadline[i]; inh.L[i] = inh.snapL[i];
    }
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
