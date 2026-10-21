import { state } from '../store.js';

  // Mortgage payoff and rent-then-buy fields that both engines return.
  export function mortgageResultAges(futureBuy, schedule) {
    const payoffYear = state.tenure === 'rentThenBuy' ? futureBuy.payoffYear : schedule.payoffYear;
    return {
      payoffAge: payoffYear === null ? null : state.ageA + payoffYear,
      buyAge: state.tenure === 'rentThenBuy' ? state.buyAge : null,
    };
  }
