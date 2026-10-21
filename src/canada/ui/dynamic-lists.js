// The children list: adds its rows to the sidebar

import { DYN } from '../core/inputs/dyn.js';
import { CHILD_BIRTH_YEAR_MAX, CHILD_BIRTH_YEAR_MIN } from '../../shared/core/inputs/lists.js';

  export function addChildrenList() {
    DYN.children = {
      key: 'children',
      container: 'childFields',
      prefix: 'child',
      noun: 'child',
      rowTitle: (i) => `Child ${i + 1}`,
      addLabel: '+ Add a child',
      note: 'Children in your household, including planned ones.',
      tip: "Feeds the Canada Child Benefit, the Canada Groceries and Essentials Benefit and the provincial child benefits and family credits (Ontario, BC, Alberta, Quebec, Saskatchewan, Manitoba, Nova Scotia, New Brunswick, Newfoundland and Labrador and PEI). Spending is NOT adjusted automatically: add what children cost under household spending, additional expenses or spending changes.",
      fresh: () => ({ birthYear: new Date().getFullYear(), student: false }),
      fields: [
        {
          key: 'birthYear',
          kind: 'num',
          label: 'Birth year',
          short: 'A future year counts from birth',
          tip: 'The calendar year the child was (or will be) born.',
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
          tip: 'For a child who joins the household after birth, such as an adopted child: the year the child moves in. The child counts for that whole year and every year after, for the Canada Child Benefit, the Canada Groceries and Essentials Benefit, the provincial benefits and the dependant amounts. The benefits really start the month after the child moves in, so the join year\'s benefits are overstated. Age still comes from the birth year. Leave blank for a child who has lived with you since birth. Adoption expense credits are not modeled.',
          min: CHILD_BIRTH_YEAR_MIN,
          max: CHILD_BIRTH_YEAR_MAX,
          step: 1,
        },
        {
          key: 'student',
          kind: 'check',
          label: 'Full-time student after 18',
          short: 'For credits that extend past 18',
          tip: 'Recorded for the credits that arrive in a later update. It has no effect on the projection today.',
        },
      ],
    };
  }
