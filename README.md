# Token Radar — the best token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/mutroll/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/mutroll/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A launch radar over the sealed DefiLlama snapshot. Of the 342 protocols that record no token,
it ranks the **198 launch candidates** — the 40-protocol watchlist included and badged — by the
value their token would carry if it launched at the protocol's current record, and gives each
one a concrete, costed farm plan. The other **144 are set aside, not ranked**: they are products
of tokens that already trade, separated by the watchlist rule's own screen — a category of
Bridge (28), Canonical Bridge (15), Liquid Staking (38), Liquid Restaking (3), Restaked BTC (2)
or CEX (42); a name ending in a version marker (11 more); or a name carrying the whole word
wrapped, staked or staking (5 more). (The exchange-name rule — a name beginning with Binance,
Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex or Gemini — catches no further protocol: all 14
such names are already set aside by their category.) Every set-aside protocol is named in the
dashboard's set-aside view with its specific reason, and carries no implied launch value and no
farm plan. Protocols whose token already trades are never ranked either; they sit apart in the
dashboard as the comps set, at the market's own values. All 342 pre-token records are accounted
for: 198 ranked + 144 set aside.

## The model

Implied value comes only from the snapshot's own figures — no protocol name is special-cased:

- Each category is priced by the live-token protocols in it: the median market-cap/TVL of its
  comps, shrunk toward the global median by the comp count, `(n × median + 8 × global) / (n + 8)`,
  clamped to [0.08, 1.50]. A category with no live comps uses the global median.
- Each row also carries a **range**: the same shrinkage applied to the category ratios' first
  and third quartiles, so the band's width is the category's own observed spread. The detail
  view shows the number of live comps behind every multiple as evidence.
- `implied = TVL × category multiple × growth × maturity × breadth`, where growth reads the
  7-day TVL change, maturity how long the protocol has run with no token recorded, and breadth
  how many chains it is live on. The dashboard recomputes every value it displays from the
  figures it carries and checks it against the board to the dollar.

## Farm plans

Each plan is generated from the protocol's category family (vaults and curators, DEX, perps,
lending, CDP, prediction markets, bridges, staking, yield, RWA, chains, exchanges, and more),
its real primary and secondary chains, its chain count, its TVL tier and its no-token age.
Plans run 5–8 steps; every step states what it costs and how long it takes; the last step is a
summary carrying the plan's totals — capital committed, estimated fees and total active time —
which the detail view shows as totals.

## Run it

Node 22, standard library only, no network. The program is deterministic: the same snapshot
writes the same bytes on every run.

```
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Outputs land in `out/`: `board.json` (the ranked board), `data.js` (the dashboard's data),
`dashboard/` (the page: board, filters, sorting, a detail view per protocol, the set-aside
view naming each product of an already-trading token with its reason, and the comps
view), `screenshots/` and `dossier.json`. Open `out/dashboard/index.html` to read the board.

Language care: a protocol on the board "records no token" in the snapshot — that is
DefiLlama's record, not proof none exists. Every implied value is this entry's own claim about
what a launch would be worth if the protocol's record stayed as it is; it is not a prediction
that a token will be issued, and it is not make.fun's claim.
