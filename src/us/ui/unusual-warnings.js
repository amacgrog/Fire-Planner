// Adds the Social Security unusual-assumption warnings

import { UNUSUAL_RANGES } from '../../shared/core/estimates-and-warnings.js';
import { fraText, SS_EARNINGS_TEST_2026, ssBeforeRetirementCase } from '../core/ss-earnings-test.js';

  export function addSocialSecurityWarnings() {
    ['A', 'B'].forEach((p) =>
      UNUSUAL_RANGES.push({
        id: 'ssStartAge' + p,
        label: 'Partner ' + p + ' Social Security starts while working',
        check: () => !!ssBeforeRetirementCase(p),
        message: () => {
          const c = ssBeforeRetirementCase(p);
          if (!c) return '';
          return 'the benefit starts at ' + c.start + ', before retirement at ' + c.retire + ' and before full retirement age (' + fraText(c.fra) + '). Social Security would withhold $1 of benefit for every $2 of wages over $' + SS_EARNINGS_TEST_2026.lower.toLocaleString('en-US') + ' (2026 figure; $1 for every $3 over $' + SS_EARNINGS_TEST_2026.higher.toLocaleString('en-US') + ' in the year full retirement age is reached) until that age; the planner does not model the earnings test, so it pays the full benefit while wages continue. The months withheld come back as a higher monthly benefit from full retirement age.';
        },
      }),
    );
  }
