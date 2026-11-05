// The one-year cash-flow diagram's money-in and money-out groups for one Canada projection row, list items recomputed from the inputs

import { pct } from '../../../shared/core/format/numbers.js';
import { cashFlowParts } from '../../../shared/core/format/cash-flow-parts.js';
import { foldItems } from '../../../shared/core/format/sankey-fold.js';
import { itemLabel, LIST_ROW_TITLES } from '../../../shared/core/inputs/list-titles.js';
import { itemGrowthFactor, lumpExpenseHits, loanSchedules } from '../../../shared/core/income/spending-and-loans.js';
import { pensionIncome } from '../../../shared/core/income/pension-income.js';
import { cppAndOasIncome } from './year-stages.js';

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
  // Items at or under 0 are left out; one below -$1 is never dropped silently (an issue).
  function finish(key, label, items, issues) {
    for (const it of items) if (it.value <= -1) issues.push(`${key}: ${it.key} is negative (${it.value})`);
    const kept = foldItems(items.filter((it) => it.value > 0));
    return { key, label, value: sumOf(kept), items: kept };
  }

  // Raw nominal dollars, the same shape as the US sankeyColumns (src/us/core/income/sankey-columns.js). The year context is rebuilt
  // as runProjection builds it (run-projection.js: the death year and the retirement-age clamp at a death, the factors, the
  // premiums, cppAndOasIncome, pensionIncome, and listAmountsForYear's rules: Partner A's age, streams with no kind, owner or death
  // rule, and loanPaymentForYear); the from-savings, tax, benefit, essentials and savings figures come from the row.
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
      isSurvivorPeriod = year >= deathYear;
    const who = (p) => (singlePerson ? '' : ' · Partner ' + p);
    const issues = [];

    // ---- Money in ----
    // Wages gross of their payroll premiums (the row's workingA / workingB carry the retirement-age clamp at a death).
    const earned = [],
      other = [];
    const workingB = !singlePerson && row.workingB;
    if (row.workingA) earned.push({ key: 'wagesA', label: 'Wages' + who('A'), value: inputs.incomeA * incomeFactor });
    if (workingB) earned.push({ key: 'wagesB', label: 'Wages' + who('B'), value: inputs.incomeB * incomeFactor });
    earned.push({ key: 'employer', label: 'Employer contributions', value: row.employerContrib });
    // Every stream is Other inflows: Canada streams have no kind and no owner and are not stopped at a death.
    const streams = inputs.incomeSources;
    for (let i = 0; i < streams.length; i++) {
      const s = streams[i];
      if (!(age >= s.startAge && age <= s.endAge)) continue;
      other.push(listItem('stream:' + i, 'incomeSources', s, i, s.amount * itemGrowthFactor(s, year, 'income', factor, incomeFactor)));
    }
    const lumps = inputs.oneTimeIncome;
    for (let i = 0; i < lumps.length; i++) {
      const o = lumps[i];
      if (Math.round(o.age) !== age) continue;
      other.push(listItem('lump:' + i, 'oneTimeIncome', o, i, o.amount * (o.flat ? 1 : factor)));
    }
    // The pair has one row figure (spec 3.4): the rest goes to Other inflows; an excess drops both splits into one item.
    let earnedItems = earned,
      otherItems = other;
    {
      const figure = row.wages + row.oneTimeCash + row.payrollPremiums + row.employerContrib,
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
    // CPP per partner; OAS one band for the household, net of the recovery tax (the row carries only its total), with the gross
    // and the recovery on the item for the tooltip.
    const cpp = cppAndOasIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }),
      pension = pensionIncome(ctx, { age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }),
      oasGross = cpp.oasGrossA + cpp.oasGrossB;
    const retirement = reconcile('retirement', 'Retirement income', [
      { key: 'cppA', label: 'CPP' + who('A'), value: cpp.cppA },
      { key: 'cppB', label: 'CPP' + who('B'), value: cpp.cppB },
      { key: 'oas', label: 'OAS', value: oasGross - row.oasClawback, gross: oasGross, recovery: row.oasClawback },
      { key: 'pensionA', label: 'Pension' + who('A'), value: pension.pensionA },
      { key: 'pensionB', label: 'Pension' + who('B'), value: pension.pensionB },
      { key: 'gis', label: 'GIS / Allowance', value: row.benefitGis + row.benefitAllowance },
      { key: 'childBenefits', label: 'Child benefits', value: row.benefitCcb + row.benefitProvChild },
      { key: 'credits', label: "Credits and provincial seniors' programs", value: row.benefitCgeb + row.benefitProvCredit + row.benefitProvSenior },
    ], row.ss + row.pension + row.benefits, issues);
    const parts = cashFlowParts(row, null).in,
      part = (k) => parts.find((p) => p.key === k).value;
    const savings = [
      { key: 'rmd', label: 'RRIF minimum', value: part('rmd') },
      { key: 'traditional', label: 'RRSP / RRIF (beyond the minimum)', value: part('traditional') },
      { key: 'roth', label: 'TFSA', value: part('roth') },
      { key: 'taxable', label: 'Non-registered', value: part('taxable') },
      { key: 'cash', label: 'Cash', value: part('cash') },
      { key: 'home', label: 'Home equity', value: part('home') },
    ];

    // ---- Money out ----
    // A negative year's tax would be money in: a Tax refund in Other inflows, outside the Earned + Other pair check.
    const taxFigure = row.tax,
      taxes = [];
    if (taxFigure < 0) otherItems = [...otherItems, { key: 'taxRefund', label: 'Tax refund', value: -taxFigure }];
    else taxes.push({ key: 'tax', label: 'Taxes', value: taxFigure });
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
      { key: 'intoRrsp', label: employerShown ? 'Into RRSP (your contributions)' : 'Into RRSP', value: row.contribRrsp },
      { key: 'intoRrspEmployer', label: 'Into RRSP (employer)', value: row.employerContrib },
      { key: 'intoTfsa', label: 'Into TFSA', value: row.contribTfsa },
      { key: 'intoFhsa', label: 'Into FHSA', value: row.contribFhsa },
      { key: 'intoCash', label: 'Into cash', value: row.cashTopUp },
      { key: 'intoNonRegistered', label: 'Into non-registered', value: row.reinvested - row.toBondReserve },
      { key: 'intoBonds', label: 'Into the bond reserve', value: row.toBondReserve },
    ];

    const inGroups = [
      finish('earned', 'Earned income', earnedItems, issues),
      finish('other', 'Other inflows', otherItems, issues),
      finish('retirement', 'Retirement income', retirement, issues),
      finish('savings', 'From savings', savings, issues),
      finish('shortfall', 'Shortfall (not funded)', [{ key: 'shortfall', label: 'Shortfall (not funded)', value: row.shortfall }], issues),
    ];
    const outGroups = [
      finish('taxes', 'Taxes', taxes, issues),
      finish('essentials', 'Essentials', essentials, issues),
      finish('everyday', 'Everyday spending', [everydayItem], issues),
      finish('extra', 'Extra & one-time', extraItems, issues),
      finish('saved', 'Savings', saved, issues),
    ];
    let total = 0;
    for (const g of inGroups) total += g.value;
    return { total, in: inGroups, out: outGroups, issues };
  }
