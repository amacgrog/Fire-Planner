# FIRE Planner

Offline, single-file HTML FIRE (Financial Independence, Retire Early) calculators. Nothing leaves your device — open the file in a browser and it runs entirely client-side.

## Files

- `index.html` — landing page linking to both tools
- `Planner_US.html` — US version: federal + all-50-state taxes, 401(k)/IRA, Social Security, Medicare IRMAA, ACA subsidies, RMDs, Roth conversion ladder
- `Planner_Canada.html` — Canada version: federal + Ontario/BC taxes, RRSP/TFSA/FHSA, CPP/OAS, RRIF minimums, pension income splitting

Both share the same underlying engine: mortgage & rent-to-buy modeling, bond-ladder bucket strategy, the 1928–2025 historical S&P 500 backtest, additional income sources, and hover-to-inspect charts.

## Versioning

These files use **stable filenames** — always `Planner_US.html` / `Planner_Canada.html`, never `_V21` or similar suffixes. Version numbers live only in the on-page header. This means:

- `index.html`'s links never go stale.
- Every update is just a `git commit`, not a rename-and-fix-links exercise.
- Full history (what changed, when, why) lives in `git log` instead of a pile of old files.

## Making an update

1. Edit the file (or have Claude edit it).
2. Save it back over the same filename (`Planner_US.html` / `Planner_Canada.html`) — don't create a new versioned copy.
3. Commit the change with a short message describing what changed.

If you're using GitHub Desktop: open the app, you'll see the changed file listed, write a one-line summary in the box at bottom left, click **Commit to main**, then click **Push origin** to sync it to GitHub.
