// US withdrawal object and the MAGI-capped traditional, Roth, penalized and inherited draws

import { ALL_FREE, accountsDrawGroup, accountsSetFromDollars } from '../accounts/account-ledger.js';
import { tradGroup, rothFreeCaps } from '../accounts/penalty-status.js';
import { taxFor } from '../tax/federal-tax.js';
import { INH_DECEDENT } from '../tax/state-rules.js';
import { rothSlotSplit, rothSlotApply } from '../accounts/roth-ledger.js';
import { drawTaxable, takeTaxable } from '../../../shared/core/withdrawals/draws.js';
import { clamp } from '../../../shared/core/format/numbers.js';
import { TAXABLE_BASIS_KEY } from './taxable-basis-key.js';

  // MAGI room left under this year's target for MAGI-bearing draws: penalty-free traditional draws (takeTraditional) and stock-account
  // taxable sales (takeStockTaxable). The conversion and any ladder gain are already inside traditionalGross / taxableGainGross when
  // the withdrawal starts.
  export function magiCapLeft(wd) {
    const c = wd.magiCap;
    return !c || c.off ? Infinity : Math.max(0, c.limit - wd.traditionalGross - wd.taxableGainGross);
  }
  // A sale from the stock taxable account (every one the strategies make but the bucket strategy's bond refill and
  // releaseMagiCap's, made with the cap lifted):
  // under the cliff plan's MAGI cap it sells at most what fits the room left (takeTaxableCapped), otherwise takeTaxable. The gain
  // it realizes is added to cappableGain, the gain a stay-under can hold back (the counterpart of cappableTraditional).
  export function takeStockTaxable(wd, amount) {
    const g0 = wd.taxableGainGross;
    const net = wd.magiCap && !wd.magiCap.off ? takeTaxableCapped(wd, 'taxable', amount, magiCapLeft(wd)) : takeTaxable(wd, 'taxable', amount);
    wd.cappableGain += wd.taxableGainGross - g0;
    return net;
  }
  // takeTaxable within a MAGI room (takeStockTaxable under the cliff plan's cap): sells at most the gross whose gain
  // portion fits `room`. The sale's gain ratio is fixed by the bucket, so the cap is room / gainRatio (the whole pool when the ratio is 0:
  // never 0 / 0). That equals takeTaxable to the bit when the room covers the whole pool's gain; a room that limits the pool but not the amount prorates the basis and can differ in the last bits. Does not add to cappableTraditional (it is not a traditional draw).
  export function takeTaxableCapped(wd, bucket, amount, room) {
    const { bal } = wd;
    const basisKey = TAXABLE_BASIS_KEY[bucket];
    const pool = bal[bucket],
      basis = bal[basisKey],
      gainRatio = clamp(1 - basis / pool, 0, 1),
      poolCap = gainRatio === 0 ? pool : Math.min(pool, room / gainRatio);
    if (!(poolCap > 0)) return 0;
    const d = drawTaxable(wd.ctx, poolCap, poolCap >= pool ? basis : (basis * poolCap) / pool, amount, wd.profile, wd.taxableGainGross, wd.traditionalGross);
    bal[bucket] -= d.taken;
    bal[basisKey] -= d.basisTaken;
    wd.taxableGainGross += d.gain;
    wd.taxableWithdrawn += d.taken;
    return d.net;
  }
  // A year's discretionary withdrawal in progress. `need` is the cash still to
  // be raised; the other fields accumulate what the draws did, for tax, MAGI
  // and the cash-flow display. traditionalGross starts at the Roth conversion
  // (ordinary income already this year) and traditionalWithdrawn at the
  // mandatory distribution; traditionalWithdrawn / taxableWithdrawn fold the
  // bond-reserve buckets into their parent tax status (same tax treatment,
  // just parked in the reserve) so the Sankey does not undercount them. `ctx` is the run context every draw
  // and solver of the year reads (wd.ctx).
  export function newWithdrawal(ctx, { bal, rothAccts, accts, seppActive, profile, conversionAmount, rmd, inh = null, inhRule = null }) {
    return {
      // E1e: the inherited ledger (null in a legacy run), the last-resort draws of the pass by post-remap slot, and the slot map and compiled
      // state rule the step reads (null without a ledger: nothing is allocated per pass in a legacy run).
      inh,
      inheritedGrossA: 0,
      inheritedGrossB: 0,
      inhPost: inh === null ? null : inh.post,
      inhRule,
      bal,
      seppActive,
      rothAccts,
      accts,
      status: ALL_FREE,
      penaltyAware: false,
      profile,
      need: 0,
      homeDrawn: 0, // this pass's draws on home equity (takeHomeEquity's returns), for the run's homeDrawAge
      taxableGainGross: 0,
      traditionalGross: conversionAmount,
      traditionalWithdrawn: rmd,
      cappableTraditional: 0,
      cappableGain: 0, // the gain of this pass's stock-account taxable sales (takeStockTaxable)
      taxableWithdrawn: 0,
      rothWithdrawn: 0,
      earlyPenalty: 0,
      mixCandidate: null,
      magiCap: null,
      onlyPartner: -1,
      taxAwareOrder: null,
      orderable: false,
      splitFirst: -1, // 4d: the split draw's first partner (0 = A, 1 = B), -1 off (takeTraditional, fillTraditional)
      splittable: false,
      ctx,
    };
  }
  // `bucket` is 'traditional' | 'bondTraditional'; `solver` picks the bisection bracket (see
  // solveTraditionalForNetFromNeed). Draws the penalty-free accounts only (no 10%); the penalized
  // ones are takePenalized's job. Every account holds the same stock/bond mix, so a group's room in a
  // bucket is its share of the pool times the bucket; a penalized draw's room is the group's whole dollars, never more than
  // the bucket (penalizedRoom). `uncapped` ignores a MAGI cap (the bond reserve's draw in both
  // strategies: cash and bonds keep their place, so the cliff plan never reorders the reserve). With wd.splitFirst set, a
  // penalty-free draw is the split draw (takeTraditionalSplit).
  export function takeTraditional(wd, bucket, amount, solver = solveTraditionalForNet, penalized = false, uncapped = false) {
    if (wd.splitFirst >= 0 && !penalized) return takeTraditionalSplit(wd, bucket, amount, solver === solveTraditionalForNetFromNeed, uncapped);
    const { bal } = wd;
    const { slots, share } = tradGroup(wd, penalized);
    let cap = penalized ? penalizedRoom(bal, bucket, share, bal.traditional + bal.bondTraditional) : bal[bucket] * share;
    if (!penalized && !uncapped && wd.magiCap) cap = Math.min(cap, magiCapLeft(wd));
    if (!(cap > 0)) return 0;
    const { fromTrad, tradNet, penalty } = solver(
      wd.ctx,
      cap,
      amount,
      wd.taxableGainGross,
      wd.traditionalGross,
      wd.profile,
      penalized ? 1 : 0,
    );
    accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, fromTrad);
    bal[bucket] -= fromTrad;
    wd.traditionalGross += fromTrad;
    wd.traditionalWithdrawn += fromTrad;
    if (!penalized && !uncapped) wd.cappableTraditional += fromTrad;
    wd.earlyPenalty += penalty;
    return tradNet;
  }
  // 4d, the split draw (spec 8, D1, D4): the penalty-free draw of takeTraditional from wd.splitFirst's accounts first, then the
  // other partner's (wd.onlyPartner, read by tradGroup), each priced on the realized share of the year's traditional income
  // (solveSplitForNet). attrA is Partner A's dollars already in traditionalGross; after each piece profile.ownerShareA is the
  // realized share. `fromNeed` picks solveTraditionalForNetFromNeed's bracket. Returns the net raised.
  function takeTraditionalSplit(wd, bucket, amount, fromNeed, uncapped) {
    const { bal, profile } = wd;
    let left = amount,
      net = 0;
    for (let k = 0; k < 2 && left > 0; k++) {
      const p = k === 0 ? wd.splitFirst : 1 - wd.splitFirst;
      wd.onlyPartner = p;
      const { slots, share } = tradGroup(wd, false);
      let cap = bal[bucket] * share;
      if (!uncapped && wd.magiCap) cap = Math.min(cap, magiCapLeft(wd));
      if (!(cap > 0)) continue;
      const attrA = profile.ownerShareA * wd.traditionalGross;
      const { fromTrad, tradNet } = solveSplitForNet(wd.ctx, cap, left, wd.taxableGainGross, wd.traditionalGross, profile, attrA, p, fromNeed);
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, fromTrad);
      bal[bucket] -= fromTrad;
      wd.traditionalGross += fromTrad;
      wd.traditionalWithdrawn += fromTrad;
      if (!uncapped) wd.cappableTraditional += fromTrad;
      if (wd.traditionalGross > 0) profile.ownerShareA = (attrA + (p === 0 ? fromTrad : 0)) / wd.traditionalGross;
      net += tradNet;
      left -= tradNet;
    }
    wd.onlyPartner = -1;
    return net;
  }
  // The split draw's bisection: solveTraditionalForNet (`fromNeed` false: [0, min(bal, 6 target + 1)]) or
  // solveTraditionalForNetFromNeed (true: [target, 6 target + 1]), never penalized, with every probe x priced on the realized share
  // (D1): profile.ownerShareA = (attrA + x if `partner` is A) / (gross + x). The base tax (x = 0) uses the share in force. Leaves
  // profile.ownerShareA at the result's share.
  export function solveSplitForNet(ctx, traditionalBal, target, gain, gross, profile, attrA, partner, fromNeed) {
    if (traditionalBal <= 0 || target <= 0) return { fromTrad: 0, tradNet: 0 };
    const baseTax = taxFor(ctx, profile, gain, gross);
    let lo = fromNeed ? target : 0,
      hi = fromNeed ? target * 6 + 1 : Math.min(traditionalBal, target * 6 + 1);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      profile.ownerShareA = (attrA + (partner === 0 ? mid : 0)) / (gross + mid);
      const net = mid - (taxFor(ctx, profile, gain, gross + mid) - baseTax);
      if (net < target) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi);
    profile.ownerShareA = (attrA + (partner === 0 ? fromTrad : 0)) / (gross + fromTrad);
    const tradNet = fromTrad - (taxFor(ctx, profile, gain, gross + fromTrad) - baseTax);
    return { fromTrad, tradNet };
  }
  // Solves for how much must come out of the traditional balance so that,
  // net of the tax (and early-withdrawal penalty, if applicable) that
  // marginal withdrawal itself triggers, `targetNet` actually lands in
  // hand — the same bisection every withdrawal branch below needs (a
  // traditional withdrawal's own tax depends on its size, so the size
  // can't be solved for directly). Pulled out as a shared helper so the
  // mix/smoothed/order/default branches don't
  // each carry their own copy of this loop.
  export function solveTraditionalForNet(
    ctx,
    traditionalBal,
    targetNet,
    taxableGainGross,
    traditionalGross,
    profile,
    penalizedFraction,
  ) {
    if (traditionalBal <= 0 || targetNet <= 0) return { fromTrad: 0, tradNet: 0, penalty: 0 };
    const baseTax = taxFor(ctx, profile, taxableGainGross, traditionalGross);
    let lo = 0,
      hi = Math.min(traditionalBal, targetNet * 6 + 1);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net =
          mid -
          (taxFor(ctx, profile, taxableGainGross, traditionalGross + mid) - baseTax) -
          mid * 0.1 * penalizedFraction;
      if (net < targetNet) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      penalty = fromTrad * 0.1 * penalizedFraction,
      tradNet =
        fromTrad - (taxFor(ctx, profile, taxableGainGross, traditionalGross + fromTrad) - baseTax) - penalty;
    return { fromTrad, tradNet, penalty };
  }
  // "Fill to the line": `gross` more from penalty-free traditional money (stocks, then bonds), the after-tax
  // proceeds kept as cash. Returns the gross drawn.
  export function fillTraditional(wd, gross) {
    if (wd.splitFirst >= 0) return fillTraditionalSplit(wd, gross);
    const { bal, ctx } = wd;
    let left = gross;
    for (const bucket of ['traditional', 'bondTraditional']) {
      if (!(left > 0)) break;
      const { slots, share } = tradGroup(wd, false),
        from = Math.min(left, bal[bucket] * share);
      if (!(from > 0)) continue;
      const before = taxFor(ctx, wd.profile, wd.taxableGainGross, wd.traditionalGross);
      accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, from);
      bal[bucket] -= from;
      wd.traditionalGross += from;
      wd.traditionalWithdrawn += from;
      bal.cash += from - (taxFor(ctx, wd.profile, wd.taxableGainGross, wd.traditionalGross) - before);
      left -= from;
    }
    return gross - left;
  }
  // 4d (D4): fillTraditional in a split pass: the bucket loop once per partner, wd.splitFirst's accounts first, each piece taxed
  // at the realized share (D1's rule, as takeTraditionalSplit).
  function fillTraditionalSplit(wd, gross) {
    const { bal, ctx, profile } = wd;
    let left = gross;
    for (let k = 0; k < 2 && left > 0; k++) {
      const p = k === 0 ? wd.splitFirst : 1 - wd.splitFirst;
      wd.onlyPartner = p;
      for (const bucket of ['traditional', 'bondTraditional']) {
        if (!(left > 0)) break;
        const { slots, share } = tradGroup(wd, false),
          from = Math.min(left, bal[bucket] * share);
        if (!(from > 0)) continue;
        const before = taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross),
          attrA = profile.ownerShareA * wd.traditionalGross;
        accountsDrawGroup(wd.accts.trad, bal.traditional + bal.bondTraditional, slots, from);
        bal[bucket] -= from;
        wd.traditionalGross += from;
        wd.traditionalWithdrawn += from;
        profile.ownerShareA = (attrA + (p === 0 ? from : 0)) / wd.traditionalGross;
        bal.cash += from - (taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) - before);
        left -= from;
      }
    }
    wd.onlyPartner = -1;
    return gross - left;
  }
  // `bucket` is 'roth' | 'bondRoth'. Roth earnings count as ordinary income (traditionalGross)
  // when the draw is early. While penalized money exists only penalty-free Roth money is drawn
  // here (rothFreeCaps); `caps` overrides that (takePenalized).
  export function takeRoth(wd, bucket, amount, caps = null) {
    const { bal } = wd;
    if (!caps && wd.penaltyAware) caps = rothFreeCaps(wd, bucket);
    const d = rothDraw(
      wd.ctx,
      wd.rothAccts,
      wd.accts.roth,
      bal.roth + bal.bondRoth,
      bal[bucket],
      amount,
      wd.taxableGainGross,
      wd.traditionalGross,
      wd.profile,
      wd.status,
      caps,
    );
    bal[bucket] -= d.gross;
    wd.rothWithdrawn += d.gross;
    wd.traditionalGross += d.earn;
    wd.earlyPenalty += d.penalty;
    return d.net;
  }
  // Draw `targetNet` (after the tax and penalty the draw itself triggers) from a Roth bucket
  // holding `bucketBal`, updating the per-account ledgers. The pool `pool` (roth + bondRoth) is
  // split among the four accounts by `shares`; by default a draw comes out of every account pro
  // rata, each account applying its own ledger rule and status (rothSlotSplit). With `caps` (a
  // gross room per account, see rothFreeCaps) the draw comes only from those accounts, in
  // proportion to their room, and the share ledger follows; the bucket is then `caps`' total.
  // `dry` prices the draw without applying it. The taxable-earnings part is returned as `earn`
  // so the caller can add it to traditionalGross (ordinary income, and the MAGI lag); `penalty`
  // is the 10% early-withdrawal penalty, which the caller adds to earlyPenalty; `tax` is the
  // income tax the earnings add.
  function rothDraw(ctx, R, shares, pool, bucketBal, targetNet, taxableGainGross, traditionalGross, profile, status, caps = null, dry = false) {
    const none = { gross: 0, net: 0, penalty: 0, earn: 0, tax: 0 };
    const capSum = caps ? caps.reduce((sum, c) => sum + c, 0) : 0,
      avail = caps ? capSum : bucketBal;
    if (targetNet > 0 && avail <= 0) return none;
    // A slightly negative target (the withdrawal bisections above overshoot by a fraction of a
    // cent) is handed back to the bucket.
    if (targetNet <= 0) {
      const gross = Math.min(avail, targetNet);
      return { gross, net: gross, penalty: 0, earn: 0, tax: 0 };
    }
    const dollars = shares.map((sh) => sh * pool);
    const weight = caps ? caps.map((c) => c / capSum) : shares;
    const pieces = (g) => {
      const sp = weight.map((w, i) => rothSlotSplit(R[i], i, dollars[i], g * w, status[i]));
      let base = 0,
        earn = 0;
      for (const x of sp) {
        base += x.penaltyBase;
        earn += x.earn;
      }
      return { sp, penalty: 0.1 * base, earn };
    };
    const apply = (sp, gross) => {
      if (dry) return;
      sp.forEach((x, i) => rothSlotApply(R[i], x));
      if (caps) {
        const d = dollars.map((dl, i) => dl - gross * weight[i]);
        accountsSetFromDollars(shares, d);
      }
    };
    // Everything comes out of penalty-free, tax-free money: dollar for dollar.
    const flat = Math.min(avail, targetNet),
      c0 = pieces(flat);
    if (c0.penalty === 0 && c0.earn === 0) {
      apply(c0.sp, flat);
      return { gross: flat, net: flat, penalty: 0, earn: 0, tax: 0 };
    }
    const baseTax = taxFor(ctx, profile, taxableGainGross, traditionalGross);
    const cost = (gross) => {
      const c = pieces(gross),
        tax = c.earn > 0 ? taxFor(ctx, profile, taxableGainGross, traditionalGross + c.earn) - baseTax : 0;
      return { ...c, tax, net: gross - tax - c.penalty };
    };
    let lo = 0,
      hi = Math.min(avail, targetNet * 6 + 1);
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (cost(mid).net < targetNet) lo = mid;
      else hi = mid;
    }
    const gross = Math.min(avail, hi),
      c = cost(gross);
    apply(c.sp, gross);
    return { gross, net: c.net, penalty: c.penalty, earn: c.earn, tax: c.tax };
  }
  // The penalized tier: only when every penalty-free source above is exhausted. Repeatedly takes the
  // cheapest source per gross dollar (income tax plus the 10%), probing each at the remaining need:
  // a penalized traditional account (tax plus 10% on the whole draw), a Roth 401(k) (the earnings share
  // only, pro rata), a Roth IRA (conversions inside their 5 years, 10% only; then earnings, tax plus
  // 10%). A tie goes to traditional, which keeps Roth growing tax-free. `solverStocks` is the
  // bisection bracket for traditional stock draws (bond draws always use solveTraditionalForNetFromNeed).
  // E1e (spec 6.6): the last resort. When the household's own money cannot meet the need, the inherited accounts are drawn: Roth rows first
  // (cash only), then traditional rows, oldest receipt first. A traditional draw is taxed exactly like a scheduled draw x larger: on the
  // owner's post-remap return, the state's inherited treatment, MAGI, never penalized. The profile fields (inhExtraS, and under a decedent
  // state inhExclS) stay at the realized values for the rest of the pass, so every later taxFor sees the draw.
  export function takeInherited(wd) {
    const inh = wd.inh;
    if (inh === null) return;
    const ctx = wd.ctx;
    ctx.stats.hooks.inhTakeCount++;
    if (!(wd.need > 0)) return;
    const { bal, profile } = wd;
    for (let i = 0; i < inh.n && wd.need > 0; i++) {
      if (!inh.roth[i] || inh.open[i] !== 1 || !(inh.bal[i] > 0)) continue;
      const x = Math.min(wd.need, inh.bal[i]);
      inh.bal[i] -= x;
      inh.lastResort[i] += x;
      bal.inheritedRoth -= x;
      wd.rothWithdrawn += x;
      wd.need -= x;
    }
    const decedent = !!wd.inhRule && wd.inhRule.inhKind === INH_DECEDENT;
    for (let i = 0; i < inh.n && wd.need > 0; i++) {
      if (inh.roth[i] || inh.open[i] !== 1 || !(inh.bal[i] > 0)) continue;
      const slotA = wd.inhPost[i] === 0,
        exKey = slotA ? 'inhExtraA' : 'inhExtraB',
        exclKey = slotA ? 'inhExclA' : 'inhExclB',
        ex0 = profile[exKey],
        excl0 = profile[exclKey],
        room = decedent ? Math.max(0, wd.inhRule.inhCap - inh.draw[i] - inh.lastResort[i]) : 0;
      const baseTax = taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross);
      const netAt = (x) => {
        profile[exKey] = ex0 + x;
        if (decedent) profile[exclKey] = excl0 + Math.min(x, room);
        return x - (taxFor(ctx, profile, wd.taxableGainGross, wd.traditionalGross) - baseTax);
      };
      let lo = 0,
        hi = Math.min(inh.bal[i], 6 * wd.need + 1);
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (netAt(mid) < wd.need) lo = mid;
        else hi = mid;
      }
      const x = hi,
        net = netAt(x);
      if (slotA) wd.inheritedGrossA += x;
      else wd.inheritedGrossB += x;
      wd.traditionalWithdrawn += x;
      inh.lastResort[i] += x;
      inh.bal[i] -= x;
      bal.inheritedTrad -= x;
      wd.need = Math.max(0, wd.need - net);
    }
  }
  // Same job as solveTraditionalForNet, but bisecting from [need, 6*need + 1]
  // instead of [0, min(balance, 6*need + 1)]. The brackets converge to slightly
  // different values (~1e-7 relative), so both are kept until the numerics are
  // unified deliberately; the bond-reserve draw and the historical engine use
  // this one.
  export function solveTraditionalForNetFromNeed(ctx, traditionalBal, need, taxableGainGross, traditionalGross, profile, penalizedFraction) {
    if (traditionalBal <= 0 || need <= 0) return { fromTrad: 0, tradNet: 0, penalty: 0 };
    const baseTax = taxFor(ctx, profile, taxableGainGross, traditionalGross);
    let lo = need,
      hi = need * 6 + 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2,
        net =
          mid -
          (taxFor(ctx, profile, taxableGainGross, traditionalGross + mid) - baseTax) -
          mid * 0.1 * penalizedFraction;
      if (net < need) lo = mid;
      else hi = mid;
    }
    const fromTrad = Math.min(traditionalBal, hi),
      penalty = fromTrad * 0.1 * penalizedFraction,
      tradNet = fromTrad - (taxFor(ctx, profile, taxableGainGross, traditionalGross + fromTrad) - baseTax) - penalty;
    return { fromTrad, tradNet, penalty };
  }
  // Penalty-free traditional dollars available to a discretionary draw this year.
  export function freeTraditional(wd) {
    return tradGroup(wd, false).share * (wd.bal.traditional + wd.bal.bondTraditional);
  }
  // Lifts the cap and takes any remaining need from the taxable money the cap held back, then penalty-free traditional money (stocks, then the bond
  // bucket): runs before penalized money and before home equity, so a target never strands money.
  export function releaseMagiCap(wd, solver) {
    if (!wd.magiCap || wd.magiCap.off) return;
    wd.magiCap.off = true;
    if (wd.need > 0 && wd.bal.taxable > 0) wd.need -= takeTaxable(wd, 'taxable', wd.need);
    if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
    if (wd.need > 0 && wd.bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
  }
  // A penalized candidate's room in `bucket`: its accounts' whole dollars (`share` of the pool `pool`), never more than the bucket.
  // Not their share of the bucket: the ledger renormalizes the shares after every draw, so an account holding both buckets would
  // keep a geometrically shrinking room in the one it was drawn from, the cheapest candidate would never empty, and takePenalized
  // would run out of passes with the need unmet and penalized money left (the year then fell through to home equity).
  function penalizedRoom(bal, bucket, share, pool) {
    return Math.min(bal[bucket], share * pool);
  }
  export function takePenalized(wd, solverStocks) {
    const { bal } = wd,
      pen = tradGroup(wd, true);
    for (let guard = 0; wd.need > 0.005 && guard < 40; guard++) {
      const cands = [];
      if (pen.share > 0)
        for (const [bucket, solver] of [['traditional', solverStocks], ['bondTraditional', solveTraditionalForNetFromNeed]]) {
          const cap = penalizedRoom(bal, bucket, tradGroup(wd, true).share, bal.traditional + bal.bondTraditional);
          if (cap > 0)
            cands.push({
              probe: () => {
                const r = solver(wd.ctx, cap, wd.need, wd.taxableGainGross, wd.traditionalGross, wd.profile, 1);
                return { gross: r.fromTrad, net: r.tradNet };
              },
              run: () => takeTraditional(wd, bucket, wd.need, solver, true),
            });
        }
      for (const bucket of ['roth', 'bondRoth'])
        for (let i = 0; i < 4; i++) {
          const room = penalizedRoom(bal, bucket, wd.accts.roth[i], bal.roth + bal.bondRoth);
          if (!(room > 0)) continue;
          const caps = [0, 0, 0, 0];
          caps[i] = room;
          cands.push({
            probe: () => {
              const pool = bal.roth + bal.bondRoth,
                d = rothDraw(wd.ctx, wd.rothAccts, wd.accts.roth, pool, bal[bucket], wd.need, wd.taxableGainGross, wd.traditionalGross, wd.profile, wd.status, caps, true);
              return { gross: d.gross, net: d.net };
            },
            run: () => takeRoth(wd, bucket, wd.need, caps),
          });
        }
      let best = null;
      for (const c of cands) {
        const pr = c.probe();
        if (!(pr.gross > 1e-9)) continue;
        const cost = 1 - pr.net / pr.gross;
        if (!best || cost < best.cost - 1e-5) best = { c, cost };
      }
      if (!best) return;
      wd.need = Math.max(0, wd.need - best.c.run());
    }
  }
