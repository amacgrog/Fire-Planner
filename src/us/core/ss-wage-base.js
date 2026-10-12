  export const SS_WAGE_BASE = 184500; // 2026 Social Security wage base (SSA), indexed with taxIndexFactor
  // E1c: self-employment tax (IRC 1401, 1402) on one person's year of self-employment profit se. Net earnings are 92.35%
  // of profit; nothing is due under $400 of net earnings. Social Security (12.4%) stops at the wage base less that person's
  // W-2 Social Security wages; Medicare is 2.9% of all net earnings. half (IRC 164(f)) is deducted from income; the 0.9%
  // Additional Medicare Tax is figured in payrollTax on wages plus ne. Pure; fills out.
  export const SE_OUT = { tax: 0, half: 0, ne: 0 };
