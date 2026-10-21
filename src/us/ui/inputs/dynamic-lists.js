// The children list: adds its rows to the sidebar

import { CHILD_BIRTH_YEAR_MAX, CHILD_BIRTH_YEAR_MIN } from '../../../shared/core/inputs/lists.js';
import { DYN } from '../../core/inputs/dyn.js';
import { currentYear } from '../../core/tax-year.js';

  export function addChildrenList() {
    DYN.children = {
      key: 'children',
      container: 'childFields',
      prefix: 'child',
      noun: 'child',
      rowTitle: (i) => `Child ${i + 1}`,
      addLabel: '+ Add a child',
      note: 'Children you claim as dependents, including planned ones.',
      tip: "Used for the Child Tax Credit and the credit for other dependents, head of household status, the ACA household size (a larger household has a higher income limit for premium subsidies) and the state child credits and exemptions. A dependent child counts until the end of the year they turn 18, or 23 if they are a full-time student. Spending is NOT adjusted automatically: add what children cost under household spending, additional expenses or spending changes.",
      fresh: () => ({ birthYear: currentYear, student: false }),
      fields: [
        {
          key: 'birthYear',
          kind: 'num',
          label: 'Birth year',
          short: 'A future year counts from birth',
          tip: 'The calendar year the child was (or will be) born. A child counts as a dependent for the whole year of birth.',
          min: CHILD_BIRTH_YEAR_MIN,
          max: CHILD_BIRTH_YEAR_MAX,
          step: 1,
        },
        {
          key: 'joinYear',
          kind: 'num',
          int: true,
          blank: true,
          placeholder: 'From birth',
          label: 'Joins the household in',
          short: 'Blank: from the birth year',
          tip: "For a child who joins the household after birth, such as an adopted child: the year the child is placed with you or moves in. The child counts as a dependent for that whole year and every year after (IRS Publication 501's rule for a child placed for adoption), for the Child Tax Credit, head of household, the ACA household and the state credits. Age still comes from the birth year. Leave blank for a child who has lived with you since birth. The Child Tax Credit assumes the child has a Social Security number; a child with only an adoption number (ATIN) gets the $500 credit for other dependents instead, which is not modeled. The adoption credit is not modeled.",
          min: CHILD_BIRTH_YEAR_MIN,
          max: CHILD_BIRTH_YEAR_MAX,
          step: 1,
        },
        {
          key: 'student',
          kind: 'check',
          label: 'Full-time student after 18',
          short: 'Counts as a dependent through age 23',
          tip: 'Checked: the child is treated as a qualifying child through the year they turn 23 (a full-time student), instead of through 18. Disabled adult children and other relatives are not modeled.',
        },
      ],
    };
  }
