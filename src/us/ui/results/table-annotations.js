// Adds solver, inherited-account and IRMAA-appeal notes to the projection table rows

import { money } from '../../../shared/core/format/numbers.js';
import { displayValue } from '../../../shared/core/format/charts.js';
import { state } from '../../../shared/core/store.js';
import { APPEAL_EVENT } from '../../core/healthcare/irmaa.js';
import { taxYearOf } from '../../core/tax/federal-rules.js';
import { storeContext } from '../../core/projection/store-context.js';

  // 3C: the year table's status cell explains the solver's choice for that year (title tooltip). US only (renderTable
  // is a shared region).
  export function annotateSolverRows(sim) {
    for (const tr of document.querySelectorAll('#projectionRows tr')) {
      const age = Number(tr.cells[0] && tr.cells[0].textContent),
        r = sim.rows.find((x) => x.age === age),
        cell = tr.querySelector('.table-status');
      if (!r || !cell) continue;
      const parts = [];
      if (r.cliffChoice) parts.push(`Income ${r.cliffChoice}`);
      // Batch 5 step 5b piece 3: a sized conversion year's target (row.convChoice, set only in a sized year).
      if (r.convChoice) parts.push(`Conversion: ${r.convChoice}`);
      cell.title = parts.join(' · ');
    }
  }
  // E1e: the status cell also says what inherited money the year holds (appended to the title; US only, renderTable is shared).
  export function annotateInheritedRows(sim) {
    for (const tr of document.querySelectorAll('#projectionRows tr')) {
      const age = Number(tr.cells[0] && tr.cells[0].textContent),
        r = sim.rows.find((x) => x.age === age),
        cell = tr.querySelector('.table-status');
      if (!r || !cell || r.inheritedTrad === undefined) continue;
      // The shared table shows money(displayValue(x, year)); the tooltip uses the same units.
      const d = (x) => money(displayValue(x, r.year)),
        drew = r.inheritedDraw > 0;
      if (!(r.inheritedTrad > 0 || r.inheritedRoth > 0 || drew)) continue;
      const note = `includes inherited traditional ${d(r.inheritedTrad)} / Roth ${d(r.inheritedRoth)}${drew ? ` · inherited drawn this year ${d(r.inheritedDraw)}` : ''}`;
      cell.title = cell.title ? `${cell.title} · ${note}` : note;
    }
  }
  export function annotateAppealRows(sim) {
    const ctx = storeContext({ withPlan: false });
    for (const tr of document.querySelectorAll('#projectionRows tr')) {
      const age = Number(tr.cells[0] && tr.cells[0].textContent),
        r = sim.rows.find((x) => x.age === age),
        cell = tr.querySelector('.table-status');
      if (!r || !cell || (r.irmaaAppealYearA === undefined && r.irmaaAppealYearB === undefined)) continue;
      const was = taxYearOf(ctx, r.year - 2),
        parts = [];
      for (const P of ['A', 'B']) {
        const used = r['irmaaAppealYear' + P];
        if (used === undefined) continue;
        const who = state.singlePerson ? 'the surcharge' : `Partner ${P}'s surcharge`;
        parts.push(`IRMAA appeal (form SSA-44, ${APPEAL_EVENT[r['irmaaAppealKind' + P]]}): ${who} uses ${used} income instead of ${was}`);
      }
      const note = parts.join(' · ');
      cell.title = cell.title ? `${cell.title} · ${note}` : note;
    }
  }
