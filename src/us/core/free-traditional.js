import { tradGroup } from './trad-group.js';

  // Penalty-free traditional dollars available to a discretionary draw this year.
  export function freeTraditional(wd) {
    return tradGroup(wd, false).share * (wd.bal.traditional + wd.bal.bondTraditional);
  }
