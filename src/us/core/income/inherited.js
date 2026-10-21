import { singleLifeFactor } from '../niit-and-rmd.js';

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
