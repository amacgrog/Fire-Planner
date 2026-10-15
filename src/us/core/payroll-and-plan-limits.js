import { pct } from '../../shared/core/basics.js';
import { dependentsInYear, LIST_MAX } from '../../shared/core/lists-and-children.js';
import { state } from '../../shared/core/store.js';
import { filingKey, taxYearOf } from './federal-deductions.js';
import { mortgageInterestShare } from './mortgage-interest-share.js';
import { rmdDivisor, rmdStartAge, singleLifeDivisor } from './niit-and-rmd.js';

  // Additional Medicare Tax (IRC 3101(b)(2)/1401(b)(2)): 0.9% of Medicare
  // wages above $250,000 (MFJ, combined) or $200,000 (single). The thresholds
  // are set by statute and are NOT inflation-indexed, so they deliberately skip
  // taxIndexFactor — bracket creep applies to them in nominal projections.
  // `filing === 'single'` covers both one person and two separate filers
  // (marry-later, before the wedding), each measured against their own $200k.
  export function additionalMedicareTax(wagesA, wagesB, filing) {
    const rate = 0.009;
    if (filingKey(filing, 'medicare') === 'mfj') return Math.max(0, wagesA + wagesB - 250000) * rate;
    return (Math.max(0, wagesA - 200000) + Math.max(0, wagesB - 200000)) * rate;
  }
  // ---- Per-year helpers shared by simulate() and simulateHistoricalCore() ----
  // IRS limits for employer plans and IRAs, 2026 values (IRS Notice 2025-67 and News Release IR-2025-111); every one is
  // indexed by limitFactor. Pure literals.
  const PLAN_LIMITS = {
    deferral: 24500, // IRC 402(g): elective deferrals
    catchUp50: 8000, // IRC 414(v): catch-up from age 50 (also 64 and over)
    catchUp60to63: 11250, // SECURE 2.0 section 109: the larger catch-up at ages 60 to 63
    annualAdditions: 72000, // IRC 415(c)(1)(A): all annual additions, also at most 100% of pay; catch-ups are outside it
    compensation: 360000, // IRC 401(a)(17): the most pay a percentage-of-pay contribution can count
    rothCatchUpWages: 150000, // SECURE 2.0 section 603: catch-ups must be Roth over this prior-year FICA wage
    ira: 7500, // IRC 219(b)(5)(A)
    iraCatchUp: 1100, // IRC 219(b)(5)(B), indexed since 2024
  };
  // Fills `room` with amounts[0], amounts[1], ... in that order: out[i] is what amounts[i] gets (a negative amount gets
  // 0). Returns the room left. Pure and country-neutral (no state, no US names): Canada's port moves it into a shared
  // fragment (E1-CA). The caller passes reusable arrays; this runs every projection year.
  export function allocatePlanRoom(room, amounts, out) {
    let left = room > 0 ? room : 0;
    for (let i = 0; i < amounts.length; i++) {
      const want = amounts[i] > 0 ? amounts[i] : 0,
        got = want < left ? want : left;
      out[i] = got;
      left -= got;
    }
    return left;
  }
  // E1b: retirement contributions from contributing W-2 income streams, after the salary. Pure (rooms, limits and rates
  // passed in; country-neutral names; no allocation). The deferral and IRA rooms are per person and are what the salary
  // left (IRC 402(g), 219(b)); each stream is its own employer for the annual-additions room (415(c)) and the
  // compensation limit. Order per stream: deferral (base, then catch-up), the match, after-tax money; then the IRA.
  // Slots: ACCOUNT_SLOTS order (IRA A, 401(k) A, IRA B, 401(k) B).
  export const STREAM_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employer: 0, employeeTrad: 0, employeeRoth: 0, wageCut: [0, 0] },
    STREAM_REQ = [0],
    STREAM_GOT = [0],
    NO_STREAM_LIST = { n: 0, items: [] },
    STREAM_ROOMS = { deferral: [0, 0], catchUp: [0, 0], personal: [0, 0] },
    STREAM_LIMITS = { annualAdditions: 0, compensation: 0, rothCatchUpWages: 0 };
  export function streamPlanContributions(list, rooms, limits, personalPretax, out) {
    for (let k = 0; k < 4; k++) { out.trad[k] = 0; out.roth[k] = 0; }
    out.employer = 0; out.employeeTrad = 0; out.employeeRoth = 0; out.wageCut[0] = 0; out.wageCut[1] = 0;
    for (let i = 0; i < list.n; i++) {
      const it = list.items[i], s = it.stream, o = it.owner, pay = it.pay,
        plan = o * 2 + 1, ira = o * 2;
      if (s.kind !== 'wages' || s.contribute !== true) continue;
      const want = Math.min(pay, rooms.deferral[o] + rooms.catchUp[o]) * pct(s.deferralPct),
        base = Math.min(want, rooms.deferral[o]),
        cu = want - base;
      rooms.deferral[o] -= base;
      rooms.catchUp[o] -= cu;
      const baseRoth = s.deferralType === 'roth',
        cuRoth = baseRoth || pay > limits.rothCatchUpWages;
      if (baseRoth) out.roth[plan] += base; else { out.trad[plan] += base; out.wageCut[o] += base; }
      if (cuRoth) out.roth[plan] += cu; else { out.trad[plan] += cu; out.wageCut[o] += cu; }
      STREAM_REQ[0] = Math.min(pay, limits.compensation) * pct(s.matchPct);
      const left = allocatePlanRoom(Math.min(pay, limits.annualAdditions) - base, STREAM_REQ, STREAM_GOT),
        match = STREAM_GOT[0],
        afterTax = Math.min(left, Math.max(0, pay - base - cu)) * pct(s.afterTaxPct);
      out.trad[plan] += match;
      out.employer += match;
      out.roth[plan] += afterTax;
      const personal = rooms.personal[o] * pct(s.personalPct);
      rooms.personal[o] -= personal;
      if (personalPretax) { out.trad[ira] += personal; out.wageCut[o] += personal; } else out.roth[ira] += personal;
      out.employeeTrad += (baseRoth ? 0 : base) + (cuRoth ? 0 : cu) + (personalPretax ? personal : 0);
      out.employeeRoth += (baseRoth ? base : 0) + (cuRoth ? cu : 0) + afterTax + (personalPretax ? 0 : personal);
    }
    return out;
  }
  // 401(k) / IRA / mega-backdoor and employer (match, profit sharing) contributions for one year. Wages are already
  // zero for a partner who has retired, and for B in single-person mode, which zeroes every pay-based amount. The
  // limits come from PLAN_LIMITS (2026 values scaled by limitFactor). Each partner's annual-additions room (the lesser
  // of the limit and 100% of pay, less the deferrals; catch-ups are outside it) is filled in plan order: the match,
  // profit sharing, then the mega backdoor. Returns the dollars that go to traditional vs Roth accounts and the
  // limited employer money.
  // E1c: the Solo 401(k) and IRA money of self-employment, after every W-2 plan (salary, W-2 streams). Pure (inputs in
  // `p`, results in `out`; no allocation). All of one person's self-employment is one business: one compensation
  // C = se - half the SE tax, one annual-additions room (IRC 415(c), common control), deferrals within the per-person room
  // the W-2 plans left (402(g)). Per person: deferrals (the main income, then `self` streams in list order), profit sharing
  // per source P_i = C_i x r / (1 + r) with the compensation limit (P = r x (C - P)), the room, after-tax money, then the
  // IRA on W-2 pay plus C less the traditional Solo money. No Roth catch-up rule (it keys on FICA wages). Every dollar is
  // the household's own cash. Slots: ACCOUNT_SLOTS order (IRA A, 401(k) A, IRA B, 401(k) B).
  export const SOLO_PLAN = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, planCut: [0, 0], iraCut: [0, 0] },
    NO_SOLO = { trad: [0, 0, 0, 0], roth: [0, 0, 0, 0], employeeTrad: 0, employeeRoth: 0, planCut: [0, 0], iraCut: [0, 0] },
    SOLO_P = new Array(LIST_MAX + 1).fill(0),
    SOLO_GOT = new Array(LIST_MAX + 1).fill(0),
    SOLO_IN = {
      se: [0, 0], half: [0, 0], main: [0, 0], w2Comp: [0, 0], iraLeft: [0, 0],
      mainPct: [{ deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }, { deferral: 0, catchUp: 0, profit: 0, afterTax: 0, ira: 0 }],
      list: null, rooms: null, annualAdditions: 0, compensation: 0, mainRoth: false, iraPretax: false, megaOn: false,
    };
  export function soloPlanContributions(p, out) {
    for (let k = 0; k < 4; k++) { out.trad[k] = 0; out.roth[k] = 0; }
    out.employeeTrad = 0; out.employeeRoth = 0; out.planCut[0] = 0; out.planCut[1] = 0; out.iraCut[0] = 0; out.iraCut[1] = 0;
    for (let o = 0; o < 2; o++) {
      const se = p.se[o];
      if (!(se > 0)) continue;
      const C = Math.max(0, se - p.half[o]), m = p.mainPct[o], main = p.main[o] > 0, list = p.list, rooms = p.rooms;
      let base = 0, cu = 0, trad = 0, roth = 0;
      // 1. Deferrals, at most the compensation left.
      if (main) {
        const b = Math.min(rooms.deferral[o], C - base - cu) * pct(m.deferral);
        rooms.deferral[o] -= b; base += b;
        const c = Math.min(rooms.catchUp[o], C - base - cu) * pct(m.catchUp);
        rooms.catchUp[o] -= c; cu += c;
        if (p.mainRoth) roth += b + c; else trad += b + c;
      }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const want = Math.min(rooms.deferral[o] + rooms.catchUp[o], C - base - cu) * pct(s.deferralPct),
          b = Math.min(want, rooms.deferral[o]);
        rooms.deferral[o] -= b; rooms.catchUp[o] -= want - b; base += b; cu += want - b;
        if (s.deferralType === 'roth') roth += want; else trad += want;
      }
      // 2-3. Profit sharing per source, then the one annual-additions room (catch-ups outside it).
      let n = 0, sumP = 0;
      if (C > 0) {
        if (main) {
          const r = pct(m.profit), Ci = (C * p.main[o]) / se;
          SOLO_P[n++] = Math.min((Ci * r) / (1 + r), (r * p.compensation * Ci) / C);
        }
        for (let i = 0; i < list.n; i++) {
          const it = list.items[i], s = it.stream;
          if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
          const r = pct(s.profitSharingPct), Ci = (C * it.pay) / se;
          SOLO_P[n++] = Math.min((Ci * r) / (1 + r), (r * p.compensation * Ci) / C);
        }
      }
      for (let k = n; k < SOLO_P.length; k++) SOLO_P[k] = 0;
      for (let k = 0; k < n; k++) sumP += SOLO_P[k];
      let left = allocatePlanRoom(Math.max(0, Math.min(p.annualAdditions, C - sumP) - base), SOLO_P, SOLO_GOT),
        profit = 0;
      for (let k = 0; k < n; k++) profit += SOLO_GOT[k];
      trad += profit;
      // 4. After-tax money, at most the compensation left.
      let afterTax = 0;
      if (main && p.megaOn) {
        const a = Math.min(left, Math.max(0, C - profit - base - cu - afterTax)) * pct(m.afterTax);
        left -= a; afterTax += a;
      }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const a = Math.min(left, Math.max(0, C - profit - base - cu - afterTax)) * pct(s.afterTaxPct);
        left -= a; afterTax += a;
      }
      roth += afterTax;
      // 5. IRA: compensation is W-2 pay plus C less the traditional Solo money.
      let iraRoom = Math.max(0, Math.min(p.iraLeft[o], p.w2Comp[o] + C - trad)), ira = 0;
      if (main) { const x = iraRoom * pct(m.ira); iraRoom -= x; ira += x; }
      for (let i = 0; i < list.n; i++) {
        const it = list.items[i], s = it.stream;
        if (it.owner !== o || s.kind !== 'self' || s.contribute !== true) continue;
        const x = iraRoom * pct(s.personalPct);
        iraRoom -= x; ira += x;
      }
      out.trad[o * 2 + 1] = trad;
      out.roth[o * 2 + 1] = roth;
      if (p.iraPretax) out.trad[o * 2] = ira; else out.roth[o * 2] = ira;
      out.employeeTrad += trad + (p.iraPretax ? ira : 0);
      out.employeeRoth += roth + (p.iraPretax ? 0 : ira);
      out.planCut[o] = trad; // section 404 plan money: reduces the 162(l) cap and QBI
      out.iraCut[o] = p.iraPretax ? ira : 0; // section 219: deducted from income only
    }
    return out;
  }
  const PLAN_REQ = [0, 0],
    PLAN_GOT = [0, 0]; // allocatePlanRoom scratch: [match, profit sharing]
  export function retirementContributions({ wageA, wageB, age, ageB, singlePerson, limitFactor, streamList = NO_STREAM_LIST, streamWagesA = 0, streamWagesB = 0, seA = 0, seB = 0, seMainA = 0, seMainB = 0, halfA = 0, halfB = 0 }) {
    const catchupBaseA =
        age >= 60 && age <= 63
          ? PLAN_LIMITS.catchUp60to63 * limitFactor
          : age >= 50
            ? PLAN_LIMITS.catchUp50 * limitFactor
            : 0,
      catchupBaseB = singlePerson
        ? 0
        : ageB >= 60 && ageB <= 63
          ? PLAN_LIMITS.catchUp60to63 * limitFactor
          : ageB >= 50
            ? PLAN_LIMITS.catchUp50 * limitFactor
            : 0;
    const baseLimitA = PLAN_LIMITS.deferral * limitFactor,
      baseLimitB = PLAN_LIMITS.deferral * limitFactor;
    const kBaseA = Math.min(wageA, baseLimitA) * pct(state.k401PctA),
      kBaseB = Math.min(wageB, baseLimitB) * pct(state.k401PctB);
    const catchupRoomA = Math.max(0, Math.min(wageA - kBaseA, catchupBaseA)),
      catchupRoomB = Math.max(0, Math.min(wageB - kBaseB, catchupBaseB));
    const kCatchupA = catchupRoomA * pct(state.catchupPctA),
      kCatchupB = catchupRoomB * pct(state.catchupPctB);
    const kA = kBaseA + kCatchupA,
      kB = kBaseB + kCatchupB;
    // SECURE 2.0: catch-up contributions must be Roth once prior-year FICA
    // wages exceed ~$150k (2026-indexed); approximated here using the
    // current-year modeled wage.
    const rothCatchupThreshold = PLAN_LIMITS.rothCatchUpWages * limitFactor,
      catchupTypeA = wageA > rothCatchupThreshold ? 'roth' : state.k401Type,
      catchupTypeB = wageB > rothCatchupThreshold ? 'roth' : state.k401Type;
    const iraLimitA = (PLAN_LIMITS.ira + (age >= 50 ? PLAN_LIMITS.iraCatchUp : 0)) * limitFactor,
      iraLimitB = singlePerson ? 0 : (PLAN_LIMITS.ira + (ageB >= 50 ? PLAN_LIMITS.iraCatchUp : 0)) * limitFactor;
    const iraA = Math.min(wageA, iraLimitA) * pct(state.iraPctA),
      iraB = Math.min(wageB, iraLimitB) * pct(state.iraPctB);
    const traditionalContribA =
      (state.k401Type === 'traditional' ? kBaseA : 0) +
      (catchupTypeA === 'traditional' ? kCatchupA : 0) +
      (state.iraType === 'traditional' ? iraA : 0);
    const traditionalContribB =
      (state.k401Type === 'traditional' ? kBaseB : 0) +
      (catchupTypeB === 'traditional' ? kCatchupB : 0) +
      (state.iraType === 'traditional' ? iraB : 0);
    const traditionalContribSalary = traditionalContribA + traditionalContribB;
    // The annual-additions room (IRC 415(c)): the lesser of the limit and 100% of pay, less the deferrals; catch-ups are
    // outside it. A plan in operation fills it in this order: deferrals as elected, the match, profit sharing, then
    // after-tax (mega backdoor) money. A percentage-of-pay contribution counts pay only up to the compensation limit.
    const annualAdditionLimit = PLAN_LIMITS.annualAdditions * limitFactor,
      compLimit = PLAN_LIMITS.compensation * limitFactor;
    const compA = Math.min(wageA, compLimit),
      compB = Math.min(wageB, compLimit);
    PLAN_REQ[0] = compA * pct(state.matchA);
    PLAN_REQ[1] = compA * pct(state.profitSharingPctA);
    const leftA = allocatePlanRoom(Math.min(wageA, annualAdditionLimit) - kBaseA, PLAN_REQ, PLAN_GOT);
    const matchA = PLAN_GOT[0],
      profitA = PLAN_GOT[1];
    PLAN_REQ[0] = compB * pct(state.matchB);
    PLAN_REQ[1] = compB * pct(state.profitSharingPctB);
    const leftB = allocatePlanRoom(Math.min(wageB, annualAdditionLimit) - kBaseB, PLAN_REQ, PLAN_GOT);
    const matchB = PLAN_GOT[0],
      profitB = PLAN_GOT[1];
    // After-tax money is the employee's own, like the deferral and catch-up, so it comes out of pay: at most the pay left
    // after them (the room above already keeps annual additions within 100% of pay; catch-ups sit outside that room).
    const megaA = state.megaBackdoor ? Math.min(leftA, Math.max(0, wageA - kA)) * pct(state.megaPctA) : 0,
      megaB = state.megaBackdoor ? Math.min(leftB, Math.max(0, wageB - kB)) * pct(state.megaPctB) : 0;
    // Contributing W-2 streams (E1b): what the salary left of each person's limits, then the streams in list order.
    STREAM_ROOMS.deferral[0] = Math.max(0, baseLimitA - kBaseA);
    STREAM_ROOMS.deferral[1] = singlePerson ? 0 : Math.max(0, baseLimitB - kBaseB);
    STREAM_ROOMS.catchUp[0] = Math.max(0, catchupBaseA - kCatchupA);
    STREAM_ROOMS.catchUp[1] = Math.max(0, catchupBaseB - kCatchupB);
    STREAM_ROOMS.personal[0] = Math.max(0, Math.min(iraLimitA - iraA, wageA + streamWagesA - iraA));
    STREAM_ROOMS.personal[1] = Math.max(0, Math.min(iraLimitB - iraB, wageB + streamWagesB - iraB));
    STREAM_LIMITS.annualAdditions = annualAdditionLimit;
    STREAM_LIMITS.compensation = compLimit;
    STREAM_LIMITS.rothCatchUpWages = rothCatchupThreshold;
    const sp = streamPlanContributions(streamList, STREAM_ROOMS, STREAM_LIMITS, state.iraType === 'traditional', STREAM_PLAN);
    // E1c: the Solo 401(k) and IRA of self-employment, after every W-2 plan (the rooms the salary and W-2 streams left).
    let so = NO_SOLO;
    if (seA + seB > 0) {
      const P = SOLO_IN;
      P.se[0] = seA; P.se[1] = seB; P.half[0] = halfA; P.half[1] = halfB; P.main[0] = seMainA; P.main[1] = seMainB;
      P.mainPct[0].deferral = state.k401PctA; P.mainPct[0].catchUp = state.catchupPctA; P.mainPct[0].profit = state.profitSharingPctA;
      P.mainPct[0].afterTax = state.megaPctA; P.mainPct[0].ira = state.iraPctA;
      P.mainPct[1].deferral = state.k401PctB; P.mainPct[1].catchUp = state.catchupPctB; P.mainPct[1].profit = state.profitSharingPctB;
      P.mainPct[1].afterTax = state.megaPctB; P.mainPct[1].ira = state.iraPctB;
      P.w2Comp[0] = wageA + streamWagesA - iraA - (sp.trad[0] + sp.roth[0]);
      P.w2Comp[1] = wageB + streamWagesB - iraB - (sp.trad[2] + sp.roth[2]);
      P.iraLeft[0] = iraLimitA - iraA - (sp.trad[0] + sp.roth[0]);
      P.iraLeft[1] = iraLimitB - iraB - (sp.trad[2] + sp.roth[2]);
      P.list = streamList; P.rooms = STREAM_ROOMS;
      P.annualAdditions = annualAdditionLimit; P.compensation = compLimit;
      P.mainRoth = state.k401Type === 'roth'; P.iraPretax = state.iraType === 'traditional'; P.megaOn = !!state.megaBackdoor;
      so = soloPlanContributions(P, SOLO_PLAN);
    }
    const rothContribA =
      (state.k401Type === 'roth' ? kBaseA : 0) +
      (catchupTypeA === 'roth' ? kCatchupA : 0) +
      (state.iraType === 'roth' ? iraA : 0) +
      megaA;
    const rothContribB =
      (state.k401Type === 'roth' ? kBaseB : 0) +
      (catchupTypeB === 'roth' ? kCatchupB : 0) +
      (state.iraType === 'roth' ? iraB : 0) +
      megaB;
    // The Solo terms are added after today's terms and only when the year has self-employment.
    const soOn = so !== NO_SOLO;
    let rothContrib = rothContribA + rothContribB + sp.employeeRoth;
    let traditionalContrib = traditionalContribSalary + sp.employeeTrad;
    if (soOn) {
      rothContrib += so.employeeRoth;
      traditionalContrib += so.employeeTrad;
    }
    // Where each dollar lands, by account (ACCOUNT_SLOTS order: IRA A, 401(k) A,
    // IRA B, 401(k) B). Employer money (match and profit sharing) always goes to the traditional 401(k);
    // mega-backdoor money goes to the Roth 401(k) (in-plan Roth conversion).
    const acct = {
      trad: [
        (state.iraType === 'traditional' ? iraA : 0) + sp.trad[0],
        (state.k401Type === 'traditional' ? kBaseA : 0) +
          (catchupTypeA === 'traditional' ? kCatchupA : 0) +
          matchA +
          profitA + sp.trad[1],
        (state.iraType === 'traditional' ? iraB : 0) + sp.trad[2],
        (state.k401Type === 'traditional' ? kBaseB : 0) +
          (catchupTypeB === 'traditional' ? kCatchupB : 0) +
          matchB +
          profitB + sp.trad[3],
      ],
      roth: [
        (state.iraType === 'roth' ? iraA : 0) + sp.roth[0],
        (state.k401Type === 'roth' ? kBaseA : 0) + (catchupTypeA === 'roth' ? kCatchupA : 0) + megaA + sp.roth[1],
        (state.iraType === 'roth' ? iraB : 0) + sp.roth[2],
        (state.k401Type === 'roth' ? kBaseB : 0) + (catchupTypeB === 'roth' ? kCatchupB : 0) + megaB + sp.roth[3],
      ],
    };
    if (soOn) {
      for (let i = 0; i < 4; i++) {
        acct.trad[i] += so.trad[i];
        acct.roth[i] += so.roth[i];
      }
    }
    return {
      traditionalContribA, traditionalContribB, traditionalContrib, rothContrib, acct,
      matchA, matchB, profitA, profitB, employerContrib: matchA + matchB + profitA + profitB + sp.employer,
      streamWageCutA: sp.wageCut[0], streamWageCutB: sp.wageCut[1],
      soloPlanCutA: soOn ? so.planCut[0] : 0, soloPlanCutB: soOn ? so.planCut[1] : 0, soloIraCutA: soOn ? so.iraCut[0] : 0, soloIraCutB: soOn ? so.iraCut[1] : 0,
    };
  }
  // Social Security for the year, each partner's own benefit once they reach
  // their claiming age, inflated by `factor`. In the survivor period the
  // household keeps the greater of the two benefits (a simplified
  // survivor-benefit swap, not the full PIA/FRA rules).
  export function socialSecurityIncome({ age, ageB, singlePerson, factor, isSurvivorPeriod, deceasedIsA }) {
    let ssA = (age >= state.ssStartAgeA ? state.ssMonthlyA * 12 : 0) * factor,
      ssB = singlePerson ? 0 : (ageB >= state.ssStartAgeB ? state.ssMonthlyB * 12 : 0) * factor;
    if (isSurvivorPeriod) {
      // Simplified survivor-benefit swap: the survivor keeps the greater
      // of the two benefits (each computed as if both were still alive),
      // rather than modeling full PIA/FRA-based survivor benefit rules.
      const survivorSS = Math.max(ssA, ssB);
      if (deceasedIsA) {
        ssA = 0;
        ssB = survivorSS;
      } else {
        ssB = 0;
        ssA = survivorSS;
      }
    }
    const ss = ssA + ssB;
    return { ssA, ssB, ss };
  }
  // Mandatory traditional distributions for the year: each partner's RMD plus
  // any elected 72(t) SEPP payment, both taxed as ordinary income and
  // force-withdrawn from the pooled traditional balance. rmdA/rmdB include the
  // SEPP amount; sepp72A/B are returned separately only for display.
  // 72(t) SEPP elections, one per traditional account in ACCOUNT_SLOTS order (IRA A, 401(k) A,
  // IRA B, 401(k) B): the election flag, its first-payment age field, and the owner.
  const SEPP_SLOTS = [
    { on: 'sepp72tIraA', from: 'sepp72tIraAgeA', partner: 0 },
    { on: 'sepp72tK401A', from: 'sepp72tK401AgeA', partner: 0 },
    { on: 'sepp72tIraB', from: 'sepp72tIraAgeB', partner: 1 },
    { on: 'sepp72tK401B', from: 'sepp72tK401AgeB', partner: 1 },
  ];
  // The accounts currently elected for 72(t) (Partner B's only for a couple).
  export function seppElections() {
    return SEPP_SLOTS.filter((sl) => state[sl.on] && !(sl.partner === 1 && state.singlePerson));
  }
  export function requiredDistributions({
    traditional,
    bondTraditional,
    age,
    ageB,
    singlePerson,
    isSurvivorPeriod,
    deceasedIsA,
    ownerShareA,
    workingA,
    workingB,
    retireAgeA,
    retireAgeB,
    accountDollars,
  }) {
    const traditionalBeforeRmd = traditional + bondTraditional,
      // Each partner's own share of the pooled traditional balance, per
      // the account ledger (ownerShareA above: Partner A's current share of
      // the pool, which moves with contributions, conversions and each
      // partner's own RMDs) — used for RMDs, 72(t) SEPP sizing, and the
      // early-withdrawal-penalty fraction below. During survivor period
      // or single-person mode, whichever partner remains is treated as
      // owning the whole pooled balance (the split only matters while
      // both partners are alive and the balance is genuinely shared).
      traditionalShareA =
        singlePerson || isSurvivorPeriod ? traditionalBeforeRmd : traditionalBeforeRmd * ownerShareA,
      traditionalShareB =
        singlePerson || isSurvivorPeriod
          ? traditionalBeforeRmd
          : traditionalBeforeRmd * (1 - ownerShareA);
    let rmdA = age >= rmdStartAge(state.ageA) ? traditionalShareA / rmdDivisor(age) : 0,
      rmdB =
        !singlePerson && ageB >= rmdStartAge(state.ageB)
          ? traditionalShareB / rmdDivisor(ageB)
          : 0;
    // 72(t) SEPP (IRC 72(t)(2)(A)(iv), Notice 2022-6 RMD method), elected per account: a mandatory,
    // penalty-free payment of that account's balance at the start of the year (accountDollars, before
    // growth) over the Single Life Table factor for the owner's age that year, recomputed every year.
    // It starts at the first-payment age (the owner's retirement age when blank, and never before it)
    // and runs through the later of 5 years or age 59.5. A start at 59.5 or later has no penalty to
    // avoid, so the election does nothing. The amount is folded into rmdA/rmdB so it is taxed and
    // force-withdrawn like an RMD (ordinary income); sepp72A/B are kept separately for display.
    // `seppActive` marks the accounts under a running plan: they supply exactly their payment, so
    // discretionary draws and Roth conversions must leave them alone (`seppLocked` is what is left in them).
    const seppSlots = [0, 0, 0, 0],
      seppActive = [false, false, false, false];
    let seppLocked = 0;
    const deadPartner = isSurvivorPeriod ? (deceasedIsA ? 0 : 1) : -1;
    SEPP_SLOTS.forEach((sl, i) => {
      const p = sl.partner;
      if (!state[sl.on] || p === deadPartner) return;
      const [ownerAge, working, retire] = p === 0 ? [age, workingA, retireAgeA] : [ageB, workingB, retireAgeB],
        entered = Number(state[sl.from]) || 0,
        start = Math.max(retire, entered > 0 ? entered : retire),
        end = Math.max(start + 5, 59.5);
      if (working || start >= 59.5 || ownerAge < start || ownerAge >= end) return;
      seppSlots[i] = accountDollars[i] / singleLifeDivisor(ownerAge);
      seppActive[i] = true;
      seppLocked += accountDollars[i] - seppSlots[i];
    });
    let sepp72A = seppSlots[0] + seppSlots[1],
      sepp72B = seppSlots[2] + seppSlots[3];
    if (isSurvivorPeriod) {
      if (deceasedIsA) {
        rmdA = 0;
        sepp72A = 0;
      } else {
        rmdB = 0;
        sepp72B = 0;
      }
    }
    rmdA += sepp72A;
    rmdB += sepp72B;
    const rmd = Math.min(traditionalBeforeRmd, rmdA + rmdB);
    return { traditionalBeforeRmd, rmdA, rmdB, rmd, sepp72A, sepp72B, seppSlots, seppActive, seppLocked };
  }
  // Shelter cost for one year: rent, or (once a home is owned) mortgage payment
  // + maintenance + property tax and insurance, plus the one-off cash cost in
  // the year a future purchase happens. Also reports the balance-sheet change
  // that comes with it: `mortgage` is the loan balance when it changes this
  // year and `homeValue` the home's value in the purchase year (both null when
  // nothing changes). projectedExpense() reads only `.housing`.
  export function housingForYear(year, factor, schedule, futureBuy) {
    const ownsHome =
      state.tenure === 'own' || (state.tenure === 'rentThenBuy' && year >= futureBuy.buyYear);
    const propCosts = ownsHome
      ? state.propertyTax * Math.pow(1 + pct(state.propertyTaxGrowth), year) +
        state.homeInsurance * Math.pow(1 + pct(state.homeInsuranceGrowth), year)
      : 0;
    const rent = state.rent * 12 * Math.pow(1 + pct(state.rentGrowth), year);
    // Federal itemizing inputs: property tax and the deductible share of this
    // year's mortgage interest (limited to $750,000 of original debt).
    const propertyTax = ownsHome
      ? state.propertyTax * Math.pow(1 + pct(state.propertyTaxGrowth), year)
      : 0;
    if (state.tenure === 'own') {
      const annualPI = schedule.payments[year] || 0;
      return {
        housing: annualPI + state.maintenance * factor + propCosts,
        mortgage: schedule.balances[year] || 0,
        homeValue: null,
        propertyTax,
        rent: 0,
        mortgageInterest:
          (schedule.interest?.[year] || 0) * mortgageInterestShare(schedule.originalPrincipal || 0),
      };
    }
    if (state.tenure === 'rent' || year < futureBuy.buyYear)
      return { housing: rent, mortgage: null, homeValue: null, propertyTax: 0, rent, mortgageInterest: 0 };
    const buyAnnualPI = futureBuy.buySchedule.payments[year] || 0;
    return {
      propertyTax,
      rent: 0,
      mortgageInterest:
        (futureBuy.buySchedule.interest?.[year] || 0) *
        mortgageInterestShare(futureBuy.buySchedule.principal || 0),
      housing:
        buyAnnualPI +
        state.maintenance * factor +
        propCosts +
        (year === futureBuy.buyYear ? futureBuy.purchaseCash : 0),
      mortgage: futureBuy.buySchedule.balances[year] || 0,
      homeValue: year === futureBuy.buyYear ? futureBuy.homeValueAtPurchase : null,
    };
  }
  // Tax filing status for the year (a key of FILING).
  //  - Unmarried with a qualifying child that year: head of household; without: single.
  //    This covers a single person, a survivor after the window below, and an unmarried
  //    couple (the household return is then two separate filers, see taxFor, so its
  //    household status stays 'single' and Partner A, who claims the children, files HoH).
  //  - "Start single, then file MFJ" (marryLater): two single filers until Partner A reaches
  //    marriageAgeA.
  //  - Survivor, if the couple was married that year: MFJ for the year of death
  //    (IRC 6013(a)(3)); qualifying surviving spouse (MFJ brackets and deduction) for the next
  //    two tax years while a qualifying child exists that year; then as an unmarried person.
  export function filingStatusFor({ age, singlePerson, isSurvivorPeriod, year, deathYear }) {
    const married = state.marryLater ? age >= state.marriageAgeA : state.filingStatus === 'mfj';
    const hasChild = dependentsInYear(taxYearOf(year)).some((d) => d.qualifyingChild);
    const unmarried = hasChild ? 'hoh' : 'single';
    let filing;
    if (isSurvivorPeriod) {
      filing =
        !married ? unmarried : year === deathYear ? 'mfj' : year - deathYear <= 2 && hasChild ? 'qss' : unmarried;
    } else if (singlePerson) filing = unmarried;
    else if (state.marryLater) filing = age >= state.marriageAgeA ? 'mfj' : 'single';
    else filing = state.filingStatus;
    return { filing };
  }
