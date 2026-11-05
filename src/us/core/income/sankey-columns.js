// The one-year cash-flow diagram's money-in and money-out groups for one US projection row, list items recomputed from the inputs

import { pct } from '../../../shared/core/format/numbers.js';
import { cashFlowParts } from '../../../shared/core/format/cash-flow-parts.js';
import { foldItems } from '../../../shared/core/format/sankey-fold.js';
import { itemLabel, LIST_ROW_TITLES } from '../../../shared/core/inputs/list-titles.js';
import { itemGrowthFactor, lumpExpenseHits, loanSchedules } from '../../../shared/core/income/spending-and-loans.js';
import { pensionIncome } from '../../../shared/core/income/pension-income.js';
import { socialSecurityIncome } from './social-security.js';

  // A list row's item: its name (or row title) as the label, the row title as `sub` when it is named, the list it came from.
  function listItem(key, listKey, row, i, value) {
    const label = itemLabel(listKey, row, i),
      title = LIST_ROW_TITLES[listKey](i),
      it = { key, label, value, list: listKey };
    if (label !== title) it.sub = title;
    return it;
  }
  const sumOf = (items) => {
    let s = 0;
    for (const it of items) s += it.value;
    return s;
  };
  // Spec 3.4: items short of the row figure by $1 or more get an "Other <group>" item; items over it by $1 or more are replaced by
  // one item of the group's label. Either pushes an issue.
  function reconcile(key, label, items, figure, issues) {
    const diff = figure - sumOf(items);
    if (diff >= 1) {
      items.push({ key: 'rest', label: 'Other ' + label.toLowerCase(), value: diff });
      issues.push(`${key}: the items fall short of the row by ${diff}`);
    } else if (diff <= -1) {
      issues.push(`${key}: the items exceed the row by ${-diff}`);
      return [{ key, label, value: figure }];
    }
    return items;
  }
  function finish(key, label, items) {
    const kept = foldItems(items.filter((it) => it.value > 0));
    return { key, label, value: sumOf(kept), items: kept };
  }

  // Raw nominal dollars. The year context is rebuilt as runProjection builds it (run-projection.js: the death year, the factors,
  // the list windows, growth, owners and death rules of listAmountsForYear / streamAmountsForYear / lumpAmountsForYear and
  // loanPaymentForYear); the from-savings, tax, essentials and savings figures come from the row.
  export function sankeyColumns(ctx, row) {
    const inputs = ctx.inputs,
      singlePerson = !!inputs.singlePerson,
      year = row.year,
      age = row.age,
      ageB = singlePerson ? null : row.ageB,
      factor = row.cumFactor ?? Math.pow(1 + pct(inputs.inflation), year),
      incomeFactor = Math.pow(1 + pct(inputs.incomeGrowth), year);
    const deceasedIsA = inputs.survivorEnabled && !singlePerson && inputs.survivorPartner === 'A',
      deceasedIsB = inputs.survivorEnabled && !singlePerson && inputs.survivorPartner === 'B',
      deathYear = deceasedIsA
        ? inputs.survivorDeathAge - inputs.ageA
        : deceasedIsB
          ? inputs.survivorDeathAge - inputs.ageB
          : Infinity,
      isSurvivorPeriod = year >= deathYear,
      deadA = deceasedIsA && year >= deathYear,
      deadB = deceasedIsB && year >= deathYear;
    const who = (p) => (singlePerson ? '' : ' · Partner ' + p);
    const issues = [];

    // ---- Money in ----
    const earned = [],
      other = [];
    const selfA = inputs.incomeKindA === 'self',
      selfB = inputs.incomeKindB === 'self',
      workingB = !singlePerson && row.workingB;
    if (row.workingA && !selfA) earned.push({ key: 'wagesA', label: 'Wages' + who('A'), value: inputs.incomeA * incomeFactor });
    if (workingB && !selfB) earned.push({ key: 'wagesB', label: 'Wages' + who('B'), value: inputs.incomeB * incomeFactor });
    const streams = inputs.incomeSources;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i],
        b = !singlePerson && s.owner === 'B',
        ownerAge = b ? ageB : age;
      if (!(ownerAge >= s.startAge && ownerAge <= s.endAge)) continue;
      const amount = s.amount * itemGrowthFactor(s, year, 'income', factor, incomeFactor);
      if (s.kind === 'wages' || s.kind === 'self') {
        if (b ? deadB : deadA) continue;
        earned.push(listItem('stream:' + i, 'incomeSources', s, i, amount));
      } else other.push(listItem('stream:' + i, 'incomeSources', s, i, amount));
    }
    if (row.workingA && selfA) earned.push({ key: 'seA', label: 'Self-employment' + who('A'), value: inputs.incomeA * incomeFactor });
    if (workingB && selfB) earned.push({ key: 'seB', label: 'Self-employment' + who('B'), value: inputs.incomeB * incomeFactor });
    earned.push({ key: 'employer', label: 'Employer contributions', value: row.employerContrib });
    const lumps = inputs.oneTimeIncome;
    for (let i = 0; i < lumps.length; i++) {
      const o = lumps[i];
      if (Math.round(o.age) !== age || o.kind === 'inheritedTrad' || o.kind === 'inheritedRoth') continue;
      other.push(listItem('lump:' + i, 'oneTimeIncome', o, i, o.amount * (o.flat ? 1 : factor)));
    }
    const seIn = row.seSettlementIn ?? 0;
    if (seIn > 0) other.push({ key: 'settlement', label: 'Health deduction settlement', value: seIn });
    // The pair has one row figure (spec 3.4): the rest goes to Other inflows; an excess drops both splits into one item.
    let earnedItems = earned,
      otherItems = other;
    {
      const figure = row.wages + row.oneTimeCash + Math.max(0, seIn) + row.payrollPremiums + row.employerContrib,
        diff = figure - (sumOf(earned) + sumOf(other));
      if (diff >= 1) {
        otherItems = [...other, { key: 'rest', label: 'Other other inflows', value: diff }];
        issues.push(`earned + other: the items fall short of the row by ${diff}`);
      } else if (diff <= -1) {
        issues.push(`earned + other: the items exceed the row by ${-diff}`);
        earnedItems = [{ key: 'earned', label: 'Earned income', value: figure }];
        otherItems = [];
      }
    }
    const ss = socialSecurityIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }),
      pension = pensionIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA });
    const retirement = reconcile('retirement', 'Retirement income', [
      { key: 'ssA', label: 'Social Security' + who('A'), value: ss.ssA },
      { key: 'ssB', label: 'Social Security' + who('B'), value: ss.ssB },
      { key: 'pensionA', label: 'Pension' + who('A'), value: pension.pensionA },
      { key: 'pensionB', label: 'Pension' + who('B'), value: pension.pensionB },
    ], row.ss + row.pension, issues);
    const parts = cashFlowParts(row, null).in,
      part = (k) => parts.find((p) => p.key === k).value;
    const savings = [
      { key: 'rmd', label: row.sepp72 > 0 ? 'RMD & 72(t)' : 'RMD', value: part('rmd') },
      { key: 'traditional', label: 'Traditional (beyond the RMD)', value: part('traditional') },
      { key: 'roth', label: 'Roth', value: part('roth') },
      { key: 'taxable', label: 'Brokerage', value: part('taxable') },
      { key: 'cash', label: 'Cash', value: part('cash') },
      { key: 'home', label: 'Home equity', value: part('home') },
    ];

    // ---- Money out ----
    const taxes = [
      { key: 'tax', label: 'Taxes', value: row.tax - row.earlyPenalty + Math.max(0, -seIn) },
      { key: 'penalty', label: 'Early-withdrawal penalty', value: row.earlyPenalty },
    ];
    const loanRows = inputs.loans,
      schedules = loanSchedules(ctx),
      loanItems = [];
    for (let i = 0; i < loanRows.length; i++) {
      // loanPaymentForYear's rule for this one loan: nothing after the death year, its balance paid off in the death year
      const l = schedules[i],
        value = isSurvivorPeriod && year > deathYear
          ? 0
          : year === deathYear
            ? (year > 0 ? l.balances[year - 1] : Number(loanRows[i]?.balance) || 0)
            : l.payments[year] || 0;
      loanItems.push(listItem('loan:' + i, 'loans', loanRows[i], i, value));
    }
    const essentials = reconcile('essentials', 'Essentials', [
      { key: 'housing', label: 'Housing', value: row.housing },
      { key: 'healthcare', label: 'Healthcare', value: row.healthcare },
      { key: 'premiums', label: 'Payroll health premiums', value: row.payrollPremiums },
      { key: 'ltc', label: 'Long-term care', value: row.ltc },
      ...loanItems,
    ], row.housing + row.healthcare + row.ltc + row.loanPayment + row.payrollPremiums, issues);
    // The active spending tier (baseSpendingNominal's rule: the active change that started latest).
    let tier = null;
    for (const t of inputs.spendingTiers) if (age >= t.startAge && age <= t.endAge && (!tier || t.startAge > tier.startAge)) tier = t;
    const everydayItem = { key: 'everyday', label: 'Everyday spending', value: row.baseSpend };
    if (tier !== null) {
      everydayItem.list = 'spendingTiers';
      const name = typeof tier.name === 'string' ? tier.name.trim() : '';
      if (name !== '') everydayItem.sub = name;
    }
    const extra = [];
    inputs.extraExpenses.forEach((e, i) => {
      if (age >= e.startAge && age <= e.endAge) extra.push(listItem('extraExp:' + i, 'extraExpenses', e, i, e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor)));
    });
    inputs.lumpExpenses.forEach((e, i) => {
      if (lumpExpenseHits(e, age)) extra.push(listItem('lumpExp:' + i, 'lumpExpenses', e, i, e.amount * itemGrowthFactor(e, year, 'expense', factor, incomeFactor)));
    });
    const extraItems = reconcile('extra', 'Extra & one-time', extra, row.extraExpense + row.lumpExpense, issues);
    const employerShown = row.employerContrib >= 1;
    const saved = [
      { key: 'intoTrad', label: employerShown ? 'Into traditional (your contributions)' : 'Into traditional', value: row.contribTraditional },
      { key: 'intoTradEmployer', label: 'Into traditional (employer)', value: row.employerContrib },
      { key: 'intoRoth', label: 'Into Roth', value: row.contribRoth },
      { key: 'intoCash', label: 'Into cash', value: row.cashTopUp },
      { key: 'intoBrokerage', label: 'Into brokerage', value: row.reinvested - row.toBondReserve },
      { key: 'intoBonds', label: 'Into the bond reserve', value: row.toBondReserve },
    ];

    const inGroups = [
      finish('earned', 'Earned income', earnedItems),
      finish('other', 'Other inflows', otherItems),
      finish('retirement', 'Retirement income', retirement),
      finish('savings', 'From savings', savings),
      finish('shortfall', 'Shortfall (not funded)', [{ key: 'shortfall', label: 'Shortfall (not funded)', value: row.shortfall }]),
    ];
    const outGroups = [
      finish('taxes', 'Taxes', taxes),
      finish('essentials', 'Essentials', essentials),
      finish('everyday', 'Everyday spending', [everydayItem]),
      finish('extra', 'Extra & one-time', extraItems),
      finish('saved', 'Savings', saved),
    ];
    let total = 0;
    for (const g of inGroups) total += g.value;
    return { total, in: inGroups, out: outGroups, issues };
  }
