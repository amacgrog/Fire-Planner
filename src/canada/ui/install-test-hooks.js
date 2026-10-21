// Test hooks this planner exposes on window

import { cppContribution, federalTaxCA, incomeTaxCA, medicalClaimToB, oasClawback, payrollItems, personTaxCA, provincialTaxCA, quebecHsf, quebecPoolAmount, quebecRamq, solvePensionSplit, taxFor, ontarioHealthPremium } from '../core/tax/tax.js';
import { FIELDS } from '../core/inputs/fields.js';
import { getBenefits, gisAnnual, gisEmploymentExemption, interpKnots, benefitsFor, gisIncomeRoom } from '../core/benefits/benefits.js';
import { cppAndOasIncome, housingForYear, oasAgeFactor, homeBuyerAmounts } from '../core/income/year-stages.js';
import { probateFee, afterTaxEstate } from '../core/analysis/estate.js';
import { PROVINCE_RULES } from '../core/tax/province-rules.js';
import { computeRothOptimizer } from './results/roth-optimizer.js';
import { drawTaxable } from '../../shared/core/withdrawals/draws.js';
import { dependentsInYear, qualifyingChildCount } from '../../shared/core/inputs/lists.js';
import { displayValue } from '../../shared/core/format/charts.js';
import { state } from '../../shared/core/store.js';
import { taxIndexFactor } from '../../shared/core/projection/year-factors.js';
import { solveTraditionalForNet, solveTraditionalForNetFromNeed } from '../core/withdrawals/draws.js';
import { BENEFIT_RULES } from '../core/benefits/benefit-rules.js';

  export function installTestHooks() {
    window.__test_getState = () => state;
    window.__test_children = { dependentsInYear, qualifyingChildCount };
    window.__test_FIELDS = FIELDS;
    window.__test_tax = { displayValue, solveTraditionalForNet, solveTraditionalForNetFromNeed, taxFor, solvePensionSplit, federalTaxCA, provincialTaxCA, personTaxCA, oasClawback, ontarioHealthPremium, PROVINCE_RULES, BENEFIT_RULES, interpKnots, gisAnnual, gisEmploymentExemption, oasAgeFactor, cppAndOasIncome, incomeTax: incomeTaxCA, benefitsFor, getBenefits, gisIncomeRoom, housingForYear, drawTaxable, cppContribution, quebecPoolAmount, taxIndexFactor, payrollItems: (w, y) => ({ ...payrollItems(w, y) }), homeBuyerAmounts, medicalClaimToB, quebecHsf, quebecRamq, probateFee, afterTaxEstate, computeRothOptimizer };
  }
