import { compact } from '../../shared/core/money-format.js';
import { mortgagePayment } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';
import { seppElections } from '../core/payroll-and-plan-limits.js';
import { openingAccounts, retirementTotal, sumSlots } from '../core/withdrawal-mix-and-roth-accounts.js';

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

    // Retirement contributions: 401(k) contribution % + account type, plus
    // mega backdoor clause when enabled.
    let contribText = `${state.k401PctA}% 401(k) · ${state.k401Type === 'roth' ? 'Roth' : 'Traditional'}`;
    if (state.megaBackdoor) contribText += ', mega backdoor on';
    setGroupState('retireContribGroupState', contribText);

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

    // Assets: taxable + traditional + Roth as "invested", cash separately.
    const invested = (state.taxable || 0) + retirementTotal();
    setGroupState('assetsGroupState', `${compact(invested)} invested · ${compact(state.cash || 0)} cash`);
    {
      const o = openingAccounts();
      setGroupState(
        'retirementAccountsGroupState',
        `${compact(sumSlots(o.trad))} traditional · ${compact(sumSlots(o.roth))} Roth`,
      );
    }

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

    // Retirement income & healthcare: SS start age(s) + ACA/LTC clauses.
    let riText =
      state.singlePerson || state.ssStartAgeA === state.ssStartAgeB
        ? `SS at ${state.ssStartAgeA}`
        : `SS at ${state.ssStartAgeA}/${state.ssStartAgeB}`;
    if (state.acaEnabled) riText += ' · ACA on';
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

    // Additional income.
    if (state.incomeSources.length || state.oneTimeIncome.length) {
      const sourcesTotal = state.incomeSources.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
      let text;
      const hasInh = state.oneTimeIncome.some((o) => o.kind === 'inheritedTrad' || o.kind === 'inheritedRoth');
      if (sourcesTotal > 0 && hasInh) text = `✓ ${compact(sourcesTotal)}/yr + inherited account`;
      else if (sourcesTotal > 0 && state.oneTimeIncome.length > 0) text = `✓ ${compact(sourcesTotal)}/yr + lump sum`;
      else if (sourcesTotal > 0) text = `✓ ${compact(sourcesTotal)}/yr`;
      else if (hasInh) text = '✓ inherited account planned';
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
    if (
      state.guardrailsEnabled ||
      state.rothConvEnabled ||
      (state.ruleOf55A || state.ruleOf55B) ||
      seppElections().length
    ) {
      const parts = [];
      if (state.guardrailsEnabled) parts.push('Guyton-Klinger');
      if (state.rothConvEnabled) parts.push('Roth ladder on');
      if (state.ruleOf55A || state.ruleOf55B) parts.push('Rule of 55');
      const sepp = seppElections();
      if (sepp.length) parts.push(`72(t) SEPP (${sepp.length} account${sepp.length > 1 ? 's' : ''})`);
      setGroupState('withdrawalStrategyGroupState', `✓ ${parts.join(' · ')}`, true);
    } else {
      setGroupState('withdrawalStrategyGroupState', '', false);
    }
  }
