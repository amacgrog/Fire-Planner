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
