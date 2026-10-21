// Builds the printable report

import { escapeHtml, money } from '../../shared/core/format/numbers.js';
import { simulate } from '../../shared/core/projection/simulate.js';
import { displayValue } from '../../shared/core/format/charts.js';
import { mode, state } from '../../shared/core/store.js';
import { getBondYears } from '../../shared/core/projection/year-factors.js';
import { retirementTotal } from '../core/accounts/account-ledger.js';
import { fiMultiple } from '../../shared/core/analysis/decisions.js';

  export function buildPrintReport() {
    const sim = simulate(),
      retirement = sim.rows.find((r) => r.year === sim.retirementYear) || sim.rows[0],
      end = sim.rows.at(-1),
      currentInvestable = state.taxable + retirementTotal() + state.cash,
      fiNumber = sim.currentExpense * fiMultiple(),
      fireNumber = sim.retirementExpense * fiMultiple(),
      tenureLabels = { own: 'Own', rent: 'Rent', rentThenBuy: 'Rent, then buy' },
      stateSelect = document.getElementById('stateTax'),
      stateLabel = stateSelect?.selectedOptions[0]?.textContent || state.stateTax,
      genDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      kv = (pairs) =>
        `<table class="pr-kv"><tbody>${pairs
          .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
          .join('')}</tbody></table>`;
    const resultsTable = kv([
      [
        'Retirement age(s)',
        state.singlePerson
          ? `Age ${state.retireAgeA}`
          : `Partner A: ${state.retireAgeA} · Partner B: ${state.retireAgeB}`,
      ],
      [
        'Investable assets at retirement',
        money(displayValue(retirement.investable, retirement.year)),
      ],
      ['Net worth at retirement', money(displayValue(retirement.total, retirement.year))],
      [
        'Investments last through',
        sim.depletedAge
          ? `Age ${sim.depletedAge} (projected shortfall)`
          : `Age ${Math.max(state.lifeExpectancyA, state.singlePerson ? 0 : state.lifeExpectancyB)}+ (not depleted)`,
      ],
      ['End assets', money(displayValue(end.total, end.year))],
      [`FI number (${Number(fiMultiple().toFixed(1))}× today's spending, ${state.fiWithdrawalRate}% withdrawal rate)`, money(fiNumber)],
      [`FIRE number (${Number(fiMultiple().toFixed(1))}× retirement spending)`, money(fireNumber)],
      [
        'Currently funded',
        `${fiNumber > 0 ? Math.min(999, (currentInvestable / fiNumber) * 100).toFixed(0) : 0}% of FI number`,
      ],
    ]);
    const assumptionsTable = kv([
      ['Household', state.singlePerson ? 'Single person' : 'Couple'],
      [
        'Current age(s)',
        state.singlePerson ? `${state.ageA}` : `Partner A: ${state.ageA} · Partner B: ${state.ageB}`,
      ],
      [
        'Plan finances through age',
        state.singlePerson
          ? `${state.lifeExpectancyA}`
          : `Partner A: ${state.lifeExpectancyA} · Partner B: ${state.lifeExpectancyB}`,
      ],
      [
        'Current household income',
        state.singlePerson ? money(state.incomeA) : `${money(state.incomeA)} + ${money(state.incomeB)}`,
      ],
      ['Annual household spending', money(state.spending)],
      ['Housing', tenureLabels[state.tenure] || state.tenure],
      ['Filing status', state.filingStatus === 'mfj' ? 'Married filing jointly' : 'Single'],
      ['Resident state', stateLabel],
      ['Stock return assumption', `${state.returnRate}%`],
      ['Bond return assumption', `${state.bondReturn}%`],
      ['HYSA / cash rate assumption', `${state.hysaRate}%`],
      ['Inflation assumption', `${state.inflation}%`],
      ['Bond reserve', `${getBondYears()} years of expenses`],
    ]);
    const chartCanvas = document.getElementById('chart');
    let chartImg = '';
    try {
      chartImg = `<img src="${chartCanvas.toDataURL('image/png')}" alt="Projected total assets chart">`;
    } catch (e) {
      chartImg = '';
    }
    const projRows = sim.rows
      .map(
        (r) =>
          `<tr><td>${r.age}${state.singlePerson ? '' : ` / ${r.ageB}`}</td><td>${money(displayValue(r.income, r.year))}</td><td>${money(displayValue(r.expenses, r.year))}</td><td>${money(displayValue(r.tax, r.year))}</td><td>${money(displayValue(r.taxable, r.year))}</td><td>${money(displayValue(r.bonds, r.year))}</td><td>${money(displayValue(r.traditional, r.year))}</td><td>${money(displayValue(r.roth, r.year))}</td><td>${money(displayValue(r.cash, r.year))}</td><td>${money(displayValue(r.homeEquity, r.year))}</td><td>${money(displayValue(r.total, r.year))}</td></tr>`,
      )
      .join('');
    document.getElementById('printReport').innerHTML = `
      <h1>FIRE Planner — Report</h1>
      <p class="pr-meta">Generated ${genDate} · Values shown in ${mode === 'real' ? "inflation-adjusted 2026 dollars" : "future nominal dollars"} · Planning estimate only — not tax, investment, or legal advice.</p>
      <h2>Key results</h2>
      ${resultsTable}
      <h2>Key assumptions</h2>
      ${assumptionsTable}
      <h2>Projected total assets</h2>
      ${chartImg}
      <h2>Year-by-year projection</h2>
      <table class="pr-proj"><thead><tr><th>Age${state.singlePerson ? '' : ' (A / B)'}</th><th>Income</th><th>Expenses</th><th>Taxes</th><th>Taxable</th><th>Bonds</th><th>Traditional</th><th>Roth</th><th>Cash</th><th>Home equity</th><th>Net assets</th></tr></thead><tbody>${projRows}</tbody></table>
      <p class="pr-disclaimer">"Income" is an estimate of taxable income (wages after retirement contributions, Social Security, pension, RMDs, and any Roth conversion) and excludes brokerage capital gains, which are taxed separately on withdrawal. "Expenses" is household spending plus healthcare, long-term care, housing, and any other loan payments; "Taxes" is estimated federal/state income tax plus payroll tax. This tool was built with AI assistance (Claude) and may contain mistakes; verify all figures independently before making financial decisions. Federal tax brackets, state brackets, retirement contribution limits, capital-gains thresholds, RMD tables, Medicare IRMAA tiers, and ACA premium tax credit rules are 2026 planning estimates and held constant in real terms.</p>
    `;
  }
