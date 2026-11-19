# Launch Radar — a token launch radar for make.fun's token-radar-01 bounty

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mutroll/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mutroll/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Launch Radar reads the sealed DefiLlama snapshot of every protocol at $5M+ TVL, finds the protocols
that record no token yet and are not a wrapped, staked or bridged product of one that trades, and
ranks them by what their launch would be worth if the protocol's record stayed as it is — each with a
concrete plan for farming it before a launch.

## Run it

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22, standard library only, no network, deterministic: the same snapshot writes the same
`board.json`, `data.js` and `dossier.json`, byte for byte, on every run. The dashboard in
`out/dashboard/` is a static page that renders from disk with no network; open it through any static
file server (it loads `../data.js`).

## The model (launch-radar-2)

Implied value is priced from the snapshot's own figures, never from a list of names:

- **Category multiple** — the median market-cap/TVL of the snapshot's live-token protocols in the
  protocol's category, shrunk toward the global median by the comp count and clamped to
  [0.08, 1.50]. A category with no live comps uses the global median.
- **Growth** — 1 + clamp(7-day TVL change, −50, 100)/100 × 0.45.
- **Maturity** — 0.78 + 0.44 × min(days tracked with no token, 1460)/1460 (0.95 when unreported).
- **Breadth** — 1 + 0.025 × min(chains − 1, 8).

`implied = TVL × multiple × growth × maturity × breadth`, factors rounded to 4 decimals first, so
the dashboard's own recomputation in `dashboard/app.js` lands on the same dollar `board.json`
carries — open any protocol's detail view and check the arithmetic.

The board holds 198 rows: all 40 watchlist protocols (the floor, held whole) plus 158 early
protocols below the floor. Protocols whose token already trades are never ranked; the dashboard
shows the top 24 in an "Already trading" view at the market's own values — they are the comps
behind the model, not candidates.

## The farm plans

Every row carries a six-step plan generated from the protocol's own record — its category's core
action (supply and borrow for lending, swap and provide liquidity for a DEX, margin for perps, a
curated vault deposit for risk curators, and so on), its first chain's gas costs, a capital tier from
its TVL, and a hold window from its age. Each step names what it costs and how long it takes. The
generator lives in `lib/model.ts` for the board and in `dashboard/app.js` for the page; both write
the same words.

## Layout

- `main.ts` — the program: snapshot in, board + dashboard data + dossier out.
- `lib/model.ts` — the screen, the comps model, the board builder, the farm-plan generator.
- `dashboard/` — `index.html`, `app.css`, `app.js`: the board, filters, sorting, detail views.
- `screenshots/` — the board, a detail view, and a filtered view, captured from the built page.
- `vendor/makefun-board.ts` — make.fun's dossier library, copied unchanged from the kit.

## How it works

`main.ts` reads the kit's sealed DefiLlama snapshot and screens out every protocol that already has a token, keeping only the pre-token candidates. Each candidate is valued with a category-multiple model: the median market-cap/TVL of live-token peers in its category, adjusted for 7-day TVL growth, how long the protocol has run with no token, and how many chains it spans. For every protocol it also generates a farm plan — concrete steps with their costs and time estimates — and emits `board.json` plus a self-contained dashboard that renders from disk with no network. Everything is deterministic: two runs over the same snapshot produce byte-identical output.
