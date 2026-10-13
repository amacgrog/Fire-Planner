import { rothDraw, solveTraditionalForNetFromNeed, takeRoth, takeTraditional } from './standard-deduction.js';
import { tradGroup } from './trad-group.js';

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
                const r = solver(cap, wd.need, wd.taxableGainGross, wd.traditionalGross, wd.profile, 1);
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
                d = rothDraw(wd.rothAccts, wd.accts.roth, pool, bal[bucket], wd.need, wd.taxableGainGross, wd.traditionalGross, wd.profile, wd.status, caps, true);
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
