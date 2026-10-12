  // Low-income provincial tax reductions (7N N6), read on the CRA 2025 provincial forms (British Columbia: the 2026 figures of CRA T4127,
  // which are the 2025 form figures indexed). Ontario and British Columbia work per return inside provincialTaxCA (Ontario: 2 x the
  // basic reduction and the child amounts, less the tax, off the tax; British Columbia: a maximum less a rate on net income over a base).
  // New Brunswick, Newfoundland and Labrador, Nova Scotia and Prince Edward Island have ONE family reduction (basic, spouse or eligible
  // dependant, children, PEI age amounts, less a rate on adjusted family income over a base), limited to the family's provincial tax (an
  // unused part passes to the spouse), worked out in incomeTaxCA from the provincial tax each return reports in PROV_TAX. Nova Scotia
  // also gives an age tax credit (65 and over, taxable income under 24,000), taken per return. Alberta, Saskatchewan, Manitoba and Quebec
  // have none (their forms were read). Not built: Ontario's dependants with an impairment, the LIFT credit (Schedule ON428-A), and the
  // reduction passing between spouses when the household's income is split unevenly beyond the family limit.
  export const PROV_TAX = { last: 0, pre: 0, fed: 0 };
