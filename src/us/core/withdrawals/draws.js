// US withdrawal object and the MAGI-capped traditional, Roth, penalized and inherited draws

import { ALL_FREE, accountsDrawGroup, accountsSetFromDollars } from '../accounts/account-ledger.js';
import { tradGroup, rothFreeCaps } from '../accounts/penalty-status.js';
import { taxFor } from '../tax/federal-tax.js';
import { INH_DECEDENT } from '../tax/state-rules.js';
import { rothSlotSplit, rothSlotApply } from '../accounts/roth-ledger.js';

  // MAGI room left under this year's target for MAGI-bearing draws (the conversion and any ladder gain
  // are already inside traditionalGross / taxableGainGross when the withdrawal starts).
  export function magiCapLeft(wd) {
    const c = wd.magiCap;
    return !c || c.off ? Infinity : Math.max(0, c.limit - wd.traditionalGross - wd.taxableGainGross);
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
      taxableGainGross: 0,
      traditionalGross: conversionAmount,
      traditionalWithdrawn: rmd,
      cappableTraditional: 0,
      taxableWithdrawn: 0,
      rothWithdrawn: 0,
      earlyPenalty: 0,
      mixCandidate: null,
      magiCap: null,
      onlyPartner: -1,
      taxAwareOrder: null,
      ctx,
    };
  }
  // `bucket` is 'traditional' | 'bondTraditional'; `solver` picks the bisection bracket (see
  // solveTraditionalForNetFromNeed). Draws the penalty-free accounts only (no 10%); the penalized
  // ones are takePenalized's job. Every account holds the same stock/bond mix, so a group's room in a
  // bucket is its share of the pool times the bucket. `uncapped` ignores a MAGI cap (the bond reserve's draw in both
  // strategies: cash and bonds keep their place, so the cliff plan never reorders the reserve).
  export function takeTraditional(wd, bucket, amount, solver = solveTraditionalForNet, penalized = false, uncapped = false) {
    const { bal } = wd;
    const { slots, share } = tradGroup(wd, penalized);
    let cap = bal[bucket] * share;
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
  // Solves for how much must come out of the traditional balance so that,
  // net of the tax (and early-withdrawal penalty, if applicable) that
  // marginal withdrawal itself triggers, `targetNet` actually lands in
  // hand — the same bisection every withdrawal branch below needs (a
  // traditional withdrawal's own tax depends on its size, so the size
  // can't be solved for directly). Pulled out as a shared helper so the
  // mix/smoothed/default branches and the live greedy picker below don't
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
  // Safe-MAGI headroom left for discretionary draws this year: the conversion has already used
  // part of the ceiling.
  export function incomeRoom(magiSafeRoom, conversionAmount) {
    return Math.max(0, magiSafeRoom - conversionAmount);
  }
  // Penalty-free traditional dollars available to a discretionary draw this year.
  export function freeTraditional(wd) {
    return tradGroup(wd, false).share * (wd.bal.traditional + wd.bal.bondTraditional);
  }
  // Lifts the cap and takes any remaining need from penalty-free traditional money (stocks, then the bond
  // bucket): runs before penalized money and before home equity, so a target never strands money.
  export function releaseMagiCap(wd, solver) {
    if (!wd.magiCap || wd.magiCap.off) return;
    wd.magiCap.off = true;
    if (wd.need > 0) wd.need = Math.max(0, wd.need - takeTraditional(wd, 'traditional', wd.need, solver));
    if (wd.need > 0 && wd.bal.bondTraditional > 0)
      wd.need = Math.max(0, wd.need - takeTraditional(wd, 'bondTraditional', wd.need, solveTraditionalForNetFromNeed));
  }
  export function takePenalized(wd, solverStocks) {
    const { bal } = wd,
      pen = tradGroup(wd, true);
    for (let guard = 0; wd.need > 0.005 && guard < 40; guard++) {
      const cands = [];
      if (pen.share > 0)
        for (const [bucket, solver] of [['traditional', solverStocks], ['bondTraditional', solveTraditionalForNetFromNeed]]) {
          const cap = bal[bucket] * tradGroup(wd, true).share;
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
          const room = wd.accts.roth[i] * bal[bucket];
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
