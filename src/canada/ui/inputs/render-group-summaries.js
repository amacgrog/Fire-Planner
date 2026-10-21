// The one-line summaries on the collapsed sidebar groups

import { compact } from '../../../shared/core/format/numbers.js';
import { mortgagePayment } from '../../../shared/core/income/spending-and-loans.js';
import { state } from '../../../shared/core/store.js';

  // Cheap, string-only sidebar group summaries — no simulate() calls, just
  // formatting already-live `state`. Called from the top of render(),
  // alongside markDefaultFields(). "Always-on" groups always get plain
  // text (never blank); "hide-when-off" groups get a '✓ ...' string (and
  // the .is-on accent class) when their feature flag is on, or an empty
  // string when it's off.
  export function renderGroupSummaries() {
    const setGroupState = (id, text, isOn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text || '';
      el.classList.toggle('is-on', !!isOn);
    };
    const freqPerYear = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };

    // Timeline: retirement ages + life expectancy.
    const retireText = state.singlePerson || state.retireAgeA === state.retireAgeB
      ? `Retire ${state.retireAgeA}`
      : `Retire ${state.retireAgeA}/${state.retireAgeB}`;
    const planToText = state.singlePerson || state.lifeExpectancyA === state.lifeExpectancyB
      ? `plan to ${state.lifeExpectancyA}`
      : `plan to ${state.lifeExpectancyA}/${state.lifeExpectancyB}`;
    setGroupState('timelineGroupState', `${retireText} · ${planToText}`);

    // Income: partner income(s) + income growth rate.
    const incomeText = state.singlePerson
      ? `${compact(state.incomeA)}/yr`
      : state.incomeA === state.incomeB
        ? `${compact(state.incomeA)} each`
        : `${compact(state.incomeA)} + ${compact(state.incomeB)}`;
    setGroupState('incomeGroupState', `${incomeText} · ${state.incomeGrowth}%/yr growth`);

    // Retirement contributions: RRSP + TFSA contribution %. No account-type
    // choice and no mega backdoor equivalent in Canada.
    setGroupState(
      'retireContribGroupState',
      `${state.rrspPctA}% RRSP · ${state.tfsaPctA}% TFSA`,
    );

    // Pre-retirement healthcare: combined premium (converted to a monthly
    // figure regardless of actual pay frequency, for a consistent unit).
    const premiumPerPeriod =
      (Number(state.healthPremiumA) || 0) +
      (state.singlePerson ? 0 : Number(state.healthPremiumB) || 0);
    const annualPremium = premiumPerPeriod * (freqPerYear[state.payFrequency] || 26);
    setGroupState(
      'preRetireHealthGroupState',
      annualPremium > 0 ? `${compact(annualPremium / 12)}/mo premiums` : 'None',
    );

    // Household spending: core annual spending + any active spending tiers.
    const activeTierCount = (state.spendingTiers || []).length;
    let spendingText = `${compact(state.spending)}/yr`;
    if (activeTierCount > 0)
      spendingText += ` · ${activeTierCount} spending change${activeTierCount === 1 ? '' : 's'}`;
    setGroupState('spendingGroupState', spendingText);

    // Assets: taxable + RRSP + TFSA as "invested", cash separately.
    const invested = (state.taxable || 0) + (state.traditional || 0) + (state.roth || 0);
    setGroupState('assetsGroupState', `${compact(invested)} invested · ${compact(state.cash || 0)} cash`);

    // Market assumptions: return, bond return, inflation.
    setGroupState(
      'marketGroupState',
      `${state.returnRate}% / ${state.bondReturn}% bonds · ${state.inflation}% inflation`,
    );

    // Housing: depends on tenure.
    let housingText;
    if (state.tenure === 'rent') {
      housingText = `Rent · ${compact(state.rent)}/mo`;
    } else if (state.tenure === 'rentThenBuy') {
      housingText = `Rent → buy at ${state.buyAge}`;
    } else {
      housingText = `Own · ${compact(state.homeValue)} · ${compact(state.mortgage)} mortgage`;
    }
    setGroupState('housingGroupState', housingText);

    // Retirement income & healthcare: CPP/OAS start ages + LTC clause.
    let riText = `CPP ${state.cppStartAgeA} · OAS ${state.oasStartAgeA}`;
    if (state.ltcEnabled) riText += ' · LTC on';
    setGroupState('retireIncomeHealthGroupState', riText);

    // --- Hide-when-off groups: empty string when off, '✓ ...' when on. ---

    // Other loans.
    if (state.loans.length) {
      const annualPayment = state.loans.reduce((sum, l) => {
        const originalPrincipal = Number(l.principal) > 0 ? Number(l.principal) : Number(l.balance) || 0;
        return sum + mortgagePayment(originalPrincipal, Number(l.rate) || 0, Number(l.term) || 0) * 12;
      }, 0);
      setGroupState(
        'otherLoansGroupState',
        `✓ ${state.loans.length} loan${state.loans.length === 1 ? '' : 's'} · ${compact(annualPayment)}/yr`,
        true,
      );
    } else {
      setGroupState('otherLoansGroupState', '', false);
    }

    // Children.
    if (state.children.length) {
      setGroupState(
        'childrenGroupState',
        `✓ ${state.children.length} child${state.children.length === 1 ? '' : 'ren'}`,
        true,
      );
    } else {
      setGroupState('childrenGroupState', '', false);
    }

    // Additional income.
    if (state.incomeSources.length || state.oneTimeIncome.length) {
      const sourcesTotal = state.incomeSources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      let text;
      if (sourcesTotal > 0 && state.oneTimeIncome.length > 0) text = `✓ ${compact(sourcesTotal)}/yr + lump sum`;
      else if (sourcesTotal > 0) text = `✓ ${compact(sourcesTotal)}/yr`;
      else if (state.oneTimeIncome.length > 0) text = '✓ lump sum planned';
      else text = '✓ stream added';
      setGroupState('otherIncomeGroupState', text, true);
    } else {
      setGroupState('otherIncomeGroupState', '', false);
    }

    // Additional expenses.
    if (state.extraExpenses.length) {
      const total = state.extraExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      setGroupState(
        'extraExpensesGroupState',
        `✓ ${state.extraExpenses.length} added · ${compact(total)}/yr`,
        true,
      );
    } else {
      setGroupState('extraExpensesGroupState', '', false);
    }

    // One-time expenses.
    if (state.lumpExpenses.length) {
      const repeating = state.lumpExpenses.filter((e) => Number(e.repeatEvery) > 0).length;
      setGroupState(
        'lumpExpensesGroupState',
        `✓ ${state.lumpExpenses.length} planned${repeating ? ` · ${repeating} repeating` : ''}`,
        true,
      );
    } else {
      setGroupState('lumpExpensesGroupState', '', false);
    }

    // Survivor planning.
    if (state.survivorEnabled) {
      setGroupState(
        'survivorGroupState',
        `✓ Partner ${state.survivorPartner}, age ${state.survivorDeathAge}`,
        true,
      );
    } else {
      setGroupState('survivorGroupState', '', false);
    }

    // Withdrawal & tax strategy: no single master flag — off means every
    // one of these is false.
    if (state.guardrailsEnabled || state.meltdownEnabled || state.pensionSplitEnabled) {
      const parts = [];
      if (state.guardrailsEnabled) parts.push('Guyton-Klinger');
      if (state.meltdownEnabled) parts.push('RRSP meltdown on');
      if (state.pensionSplitEnabled) parts.push('Pension splitting on');
      setGroupState('withdrawalStrategyGroupState', `✓ ${parts.join(' · ')}`, true);
    } else {
      setGroupState('withdrawalStrategyGroupState', '', false);
    }
  }
