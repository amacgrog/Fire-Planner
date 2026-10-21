// Test hooks this planner exposes on window

import { cppContribution, federalTaxCA, incomeTaxCA, medicalClaimToB, oasClawback, payrollItems, personTaxCA, provincialTaxCA, quebecHsf, quebecPoolAmount, quebecRamq, solvePensionSplit, taxFor } from '../core/federal-tax-ca.js';
import { FIELDS } from '../core/fields.js';
import { getBenefits } from '../core/get-benefits.js';
import { gisAnnual, gisEmploymentExemption, interpKnots } from '../core/gis-and-rrif.js';
import { cppAndOasIncome, housingForYear, oasAgeFactor } from '../core/income-and-housing-per-year.js';
import { homeBuyerAmounts } from '../core/list-amounts-and-home-buyers.js';
import { probateFee } from '../core/probate-fee.js';
import { PROVINCE_RULES } from '../core/province-rules.js';
import { computeRothOptimizer } from './roth-optimizer.js';
import { drawTaxable } from '../../shared/core/draw-taxable.js';
import { dependentsInYear, qualifyingChildCount } from '../../shared/core/lists-and-children.js';
import { displayValue } from '../../shared/core/spending-and-loans.js';
import { state } from '../../shared/core/store.js';
import { taxIndexFactor } from '../../shared/core/tax-index-factor.js';
import { benefitsFor, gisIncomeRoom } from '../core/benefits/benefits.js';
import { afterTaxEstate } from '../core/analysis/estate.js';
import { solveTraditionalForNet, solveTraditionalForNetFromNeed } from '../core/withdrawals/draws.js';
import { BENEFIT_RULES } from '../core/benefits/benefit-rules.js';
import { ontarioHealthPremium } from '../core/tax/tax.js';

  export function installTestHooks() {
    window.__test_getState = () => state;
    window.__test_children = { dependentsInYear, qualifyingChildCount };
    window.__test_FIELDS = FIELDS;
    window.__test_tax = { displayValue, solveTraditionalForNet, solveTraditionalForNetFromNeed, taxFor, solvePensionSplit, federalTaxCA, provincialTaxCA, personTaxCA, oasClawback, ontarioHealthPremium, PROVINCE_RULES, BENEFIT_RULES, interpKnots, gisAnnual, gisEmploymentExemption, oasAgeFactor, cppAndOasIncome, incomeTax: incomeTaxCA, benefitsFor, getBenefits, gisIncomeRoom, housingForYear, drawTaxable, cppContribution, quebecPoolAmount, taxIndexFactor, payrollItems: (w, y) => ({ ...payrollItems(w, y) }), homeBuyerAmounts, medicalClaimToB, quebecHsf, quebecRamq, probateFee, afterTaxEstate, computeRothOptimizer };
  }
