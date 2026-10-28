// Roth conversion sizing targets (Batch 5 step 5b piece 3): a per-year target resolved to an amount, and the line targets a lines list offers

  // The amount a conversion target converts on this pass (spec B6, the resolution rule; B0.2 for a per-return line). `target` is
  // 'none', a bracket 'b10'..'b35' or a line `{ id, ret, side }`; `t` is the pass's `{ lines, preMagi, preMagiA, preMagiB, shareA,
  // convertible, bracketTop }` (`lines` in magiThresholds' shape; `bracketTop(pct)` the conversion that fills to that bracket's
  // top). A bracket gives its top, capped at the convertible balance; a household line `magi - 1 - preMagi` under it or
  // `magi + 1 - preMagi` over it; a per-return line the same on its own return (`own`, that return's pre-conversion MAGI) divided by
  // the return's share of the conversion. A line target whose line is not in `lines` (looked up by id and return), whose return
  // carries no share, or whose amount is not above 0 gives -1 (not carried: the caller converts the user's bracket under today's
  // ceiling); otherwise the amount, capped at the convertible balance. Pure.
  export function resolveConvTarget(target, t) {
    if (target === 'none') return 0;
    if (typeof target === 'string') return Math.min(t.bracketTop(Number(target.slice(1))), t.convertible);
    const lines = t.lines;
    let ln = null;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].id === target.id && lines[i].ret === target.ret) {
        ln = lines[i];
        break;
      }
    }
    if (ln === null) return -1;
    const under = target.side === 'under';
    let amount;
    if (target.ret === 'H') amount = under ? ln.magi - 1 - t.preMagi : ln.magi + 1 - t.preMagi;
    else {
      const share = target.ret === 'A' ? t.shareA : 1 - t.shareA,
        pre = target.ret === 'A' ? t.preMagiA : t.preMagiB;
      if (!(share > 0)) return -1;
      amount = (under ? ln.own - 1 - pre : ln.own + 1 - pre) / share;
    }
    if (!(amount > 0)) return -1;
    return Math.min(amount, t.convertible);
  }
  // The line targets a lines list offers (spec B0.2, builder's call C2): one per line whose id is in `lineIds` (the US caller
  // passes PLAN_LINE_IDS, so the tax-family lines senior and ctc are dropped), in the list's order: the ACA credit floor is
  // crossed from below ('over'), every other line is a ceiling kept under ('under'). Pure.
  export function convLineTargets(lines, lineIds) {
    const out = [];
    for (const l of lines) if (lineIds.includes(l.id)) out.push({ id: l.id, ret: l.ret, side: l.id === 'acaFloor' ? 'over' : 'under' });
    return out;
  }
  // A conversion candidate's score (spec B5.3, B0.3): what `c` converted dollars gain at the year's lambda less the tax, premium
  // and IRMAA they add over converting nothing, evaluated in this order (so a test can write the figure). Pure.
  export function convScore(c, lambdaConv, dTax, dPremium, dIrmaa) {
    return ((c * lambdaConv - dTax) - dPremium) - dIrmaa;
  }
  // The winning conversion candidate's index (spec B0.3): `cands` (`[{ target, c, score, dropped }]`) is already in scan order (by
  // amount ascending, the bracket target first at an equal amount, 0 included); a dropped candidate is skipped, and the running
  // best is replaced only by a score higher by more than $1, so ties go to the smaller amount. -1 when every candidate is dropped.
  // Pure.
  export function pickConvTarget(cands) {
    let best = -1;
    for (let i = 0; i < cands.length; i++) {
      if (cands[i].dropped) continue;
      if (best < 0 || cands[i].score > cands[best].score + 1) best = i;
    }
    return best;
  }
  // The bridge check (spec B0.7, builder's call C5; the early years only, controller ruling 2026-10-28): true when a candidate
  // converting `extra` more than the bracket target leaves too little penalty-free money for the years year+1..year+4 (`early`):
  // `accessible` less the free traditional dollars the extra conversion moves into unseasoned Roth (`extra x freeTradShare`) and the
  // extra tax, premium and IRMAA (`taxIncrease`). The years from year + 5 are not tested: every extra converted dollar adds a dollar
  // of access from year + 5 for less than a dollar of tax, so a total-need test can only get easier as the conversion grows and can
  // never justify the smaller one; the drain risk is the years before the conversion seasons. Pure.
  export function bridgeShort({ accessible, extra, freeTradShare, taxIncrease, early }) {
    return accessible - extra * freeTradShare - taxIncrease < early;
  }
  // Whether a candidate other than the bracket target is offered (controller ruling 2026-10-28): not when its amount is within $1 of
  // the bracket conversion `bracketConv` (the bracket stands: no intent, no sized phase for a near tie). Pure.
  export function convOffered(c, bracketConv) {
    return Math.abs(c - bracketConv) > 1;
  }
