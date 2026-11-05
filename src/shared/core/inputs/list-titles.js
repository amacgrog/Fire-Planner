// The row titles of the six add-as-you-go lists and the label of a named row (pure, importable from core/)

  // The longest a row name can be (the field's maxlength and the normalizer's clip).
  export const LIST_NAME_MAX = 40;
  // load-time: freezes a literal of arrows; reads nothing
  export const LIST_ROW_TITLES = Object.freeze({
    loans: (i) => `Loan ${i + 1}`,
    incomeSources: (i) => `Income stream ${i + 1}`,
    oneTimeIncome: (i) => `One-time income ${i + 1}`,
    extraExpenses: (i) => `Expense ${i + 1}`,
    spendingTiers: (i) => `Spending change ${i + 1}`,
    lumpExpenses: (i) => `One-time expense ${i + 1}`,
  });
  // The row's own name when it has one, else its title ("Loan 2").
  export function itemLabel(listKey, item, i) {
    const name = item && typeof item.name === 'string' ? item.name.trim() : '';
    return name !== '' ? name : LIST_ROW_TITLES[listKey](i);
  }
