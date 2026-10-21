// The list of numeric field ids, from the registry

import { FIELDS } from '#country/ui/seam-FIELDS';

  // load-time: filters FIELDS, an imported constant; reads nothing a statement writes.
  export const ids = FIELDS.filter((field) => field.type === 'number').map((field) => field.key);
