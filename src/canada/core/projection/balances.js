  // Takes the year's mandatory distribution (RMD + 72(t) SEPP) out of the
  // traditional balance first, then out of the traditional bond bucket.
  export function withdrawRequiredDistributions(bal, rmd) {
    const rmdFromTraditional = Math.min(bal.traditional, rmd);
    bal.traditional = Math.max(0, bal.traditional - rmdFromTraditional);
    bal.bondTraditional = Math.max(0, bal.bondTraditional - (rmd - rmdFromTraditional));
  }
