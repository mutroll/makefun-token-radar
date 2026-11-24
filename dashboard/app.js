// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// sealed snapshot) and renders the ranked board — the pre-token launch candidates that pass
// the screen — a filterable and sortable table, a per-protocol detail view with the model's
// arithmetic, its implied range and its farm plan with totals, a set-aside view naming every
// pre-token protocol that is a product of a token that already trades, with its specific
// reason (not ranked, no implied value, no farm plan), and a comps view of the protocols whose
// token already trades. No network: every byte it shows is in data.js.
//
// The value model, restated so the page can recompute every row it shows (impliedOf below):
//   multiple(category) = the median market-cap/TVL of the snapshot's live-token protocols in
//     the category, shrunk toward the global median by the comp count, (n x median + 8 x
//     global)/(n + 8), clamped to [0.08, 1.50]; a category with no live comps uses the global.
//   range = the same shrinkage applied to the category ratios' first and third quartiles.
//   implied = TVL x multiple x growth x maturity x breadth, with
//     growth   = 1 + clamp(change_7d, -50, 100)/100 x 0.45   (unreported growth: neutral)
//     maturity = 0.78 + 0.44 x min(age_days, 1460)/1460      (age unreported: 0.95)
//     breadth  = 1 + 0.025 x min(chains - 1, 8)
//   Factors are rounded to 4 decimals before the multiplication, exactly as lib/model.ts rounds
//   them, so the number this page recomputes is the number board.json carries — value and range.
// The farm generator below is the page's copy of the one in lib/model.ts: same category family,
// chains, TVL tier and age in, same steps and totals out, so the plan a reader opens in the
// detail view is the plan board.json holds, word for word.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var M = DATA.model;
  var app = document.getElementById('board');

  // ---------------------------------------------------------------- state (URL params seed it, so
  // a view can be linked, screenshotted and reproduced: ?tab=live, ?cat=Dexs, ?detail=<slug>, ...)
  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '',
    category: params.get('cat') || 'all',
    chain: params.get('chain') || 'all',
    set: params.get('set') || 'all',
    tab: params.get('tab') || 'board',
    sort: params.get('sort') || 'implied',
    dir: params.get('dir') === 'asc' ? 1 : -1,
    selected: params.get('detail') || null,
  };

  // ---------------------------------------------------------------- formatting
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unreported';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
  function money(n) {
    var r = round2(n);
    return '$' + (Number.isInteger(r) ? r.toLocaleString('en-US') : r.toFixed(2));
  }
  function timeText(minutes) {
    if (minutes < 60) return minutes + 'm';
    var h = Math.floor(minutes / 60);
    var m = minutes % 60;
    return m === 0 ? h + 'h' : h + 'h ' + String(m).padStart(2, '0') + 'm';
  }

  // ---------------------------------------------------------------- the model, in the page
  function multipleOf(category) {
    var key = category || 'Uncategorized';
    for (var i = 0; i < DATA.comps.length; i++) if (DATA.comps[i].category === key) return DATA.comps[i];
    var g = DATA.comps[0];
    return { category: key, comps: g.comps, median: g.median, q1: g.q1, q3: g.q3, multiple: g.multiple, multiple_low: g.multiple_low, multiple_high: g.multiple_high };
  }
  function impliedOf(row) {
    var comp = multipleOf(row.category);
    var growthPct = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
    var growth = round4(1 + (growthPct / 100) * M.growth_weight);
    var maturity = row.age_days === null || row.age_days === undefined
      ? M.unknown_age_mult
      : round4(M.maturity_base + (Math.min(row.age_days, M.maturity_days) / M.maturity_days) * M.maturity_range);
    var breadth = round4(1 + M.breadth_step * Math.min(Math.max(row.chains.length - 1, 0), M.breadth_max_extra));
    function at(multiple) { return Math.max(1, Math.round(row.tvl_usd * multiple * growth * maturity * breadth)); }
    var base = at(comp.multiple);
    return {
      implied: base,
      low: Math.min(at(comp.multiple_low), base),
      high: Math.max(at(comp.multiple_high), base),
      multiple: comp.multiple, multiple_low: comp.multiple_low, multiple_high: comp.multiple_high,
      comps: comp.comps, median: comp.median, q1: comp.q1, q3: comp.q3,
      growth: growth, maturity: maturity, breadth: breadth,
    };
  }

  // ---------------------------------------------------------------- the farm plan, in the page
  function slugHash(slug) {
    var h = 0x811c9dc5;
    for (var i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 12;
    if (c === 'solana' || c === 'sui') return 0.1;
    if (c === 'base' || c === 'arbitrum' || c === 'op mainnet' || c === 'optimism' || c === 'linea' || c === 'scroll' || c === 'mantle' || c === 'unichain') return 0.4;
    if (c === 'bsc' || c === 'binance' || c === 'polygon' || c === 'avalanche' || c === 'fantom' || c === 'sonic' || c === 'celo' || c === 'cronos') return 0.3;
    if (c === 'bitcoin') return 3;
    return 1.2;
  }
  function capitalFor(tvl) {
    if (tvl >= 1e9) return 300;
    if (tvl >= 2.5e8) return 200;
    if (tvl >= 5e7) return 150;
    if (tvl >= 1e7) return 100;
    return 60;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    if (age < 730) return 35;
    return 30;
  }
  function familyOf(category) {
    var c = (category || '').toLowerCase();
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('liquidity manager') >= 0 || c.indexOf('yield aggregator') >= 0 || c.indexOf('options vault') >= 0) return 'vault';
    if (c.indexOf('dex') >= 0) return 'dex';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0) return 'perps';
    if (c.indexOf('cdp') >= 0 || c.indexOf('dual-token') >= 0) return 'cdp';
    if (c.indexOf('lending') >= 0 || c.indexOf('collateral') >= 0) return 'lending';
    if (c.indexOf('prediction') >= 0) return 'prediction';
    if (c.indexOf('bridge') >= 0) return 'bridge';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'staking';
    if (c.indexOf('rwa') >= 0) return 'rwa';
    if (c === 'chain') return 'chain';
    if (c.indexOf('cex') >= 0 || c.indexOf('cede') === 0) return 'exchange';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('basis') >= 0) return 'yield';
    return 'other';
  }
  function coreStep(row, fam, capital, chain, gas) {
    var name = row.name;
    var half = Math.round(capital / 2);
    var third = Math.round(capital / 3);
    var fifth = Math.round(capital / 5);
    function mk(text, fee) {
      return { text: text, cost: money(capital) + ' of capital and about ' + money(fee) + ' of fees and gas', time: '15 minutes to set up', fee: fee, minutes: 15 };
    }
    if (fam === 'vault') return mk('Deposit ' + money(capital) + ' of USDC into a ' + name + ' vault on ' + chain + ' — choose the vault whose curator, strategy and withdrawal terms are stated on its own page — and keep the vault shares in the farm wallet, unsold', gas);
    if (fam === 'dex') return mk("Swap about " + money(half) + " of USDC into the base asset and back on " + name + "'s deepest " + chain + ' market, then pool the remaining ' + money(capital - half) + ' as two-sided liquidity in that same market, so the wallet earns both volume and LP history', 2 * gas + capital * 0.003);
    if (fam === 'perps') return mk('Deposit ' + money(capital) + ' of USDC as margin on ' + name + ' and open a delta-neutral pair — long and short the same notional on its most liquid ' + chain + ' market — so the wallet books real volume without betting on direction', 2 * gas + capital * 0.001);
    if (fam === 'lending') return mk('Supply ' + money(capital) + ' of USDC to ' + name + "'s main " + chain + ' market, then borrow about ' + money(third) + ' of a second asset against it once and repay within the week, so the wallet appears on both sides of the book', 2 * gas);
    if (fam === 'cdp') return mk('Open a vault on ' + name + ' on ' + chain + ': deposit ' + money(capital) + ' of ETH or a liquid staking token as collateral at no more than half the liquidation threshold, and mint a modest amount of its stablecoin against it', 2 * gas);
    if (fam === 'prediction') return mk('Fund the farm wallet with ' + money(capital) + ' and take one position on each side of ' + name + "'s two most liquid markets, no more than " + money(fifth) + ' a side, so the account trades without needing to be right', gas + 2);
    if (fam === 'bridge') return mk('Bridge ' + money(capital) + ' of USDC from ' + chain + ' to ' + (row.chains[1] || 'a second chain it serves') + " through " + name + "'s own route and leave the bridged funds working on the far side for the whole hold", 3 + gas);
    if (fam === 'staking') return mk('Stake ' + money(capital) + " of the chain's staking asset through " + name + ' on ' + chain + ' and hold the receipt token unsold for the full hold — the receipt staying in the wallet is the whole proof of participation', gas);
    if (fam === 'yield') return mk('Deposit ' + money(capital) + ' of USDC into ' + name + "'s main strategy on " + chain + " and leave it compounding; if the strategy is leveraged or basis-based, keep it at the strategy's own default settings rather than raising the risk", gas);
    if (fam === 'rwa') return mk('Mint ' + money(capital) + ' of ' + name + "'s yield-bearing asset on " + chain + ' with USDC, completing any holder checks its page requires first, and hold the asset untouched for the full hold', gas + 1);
    if (fam === 'chain') return mk('Bridge ' + money(capital) + ' of USDC onto ' + name + ' itself and become a regular there: pay gas in its native asset, swap on its main exchange and keep a small working balance on the chain for the whole hold', 3 * gas);
    if (fam === 'exchange') return { text: 'Open a ' + name + ' account in your own name, complete its identity checks, deposit ' + money(capital) + ' of USDC and make two ordinary spot trades a week apart, leaving the balance on the account between them', cost: money(capital) + ' of capital and about ' + money(1 + capital * 0.001) + ' of trading and deposit fees', time: '25 minutes including the checks', fee: 1 + capital * 0.001, minutes: 25 };
    var c = (row.category || '').toLowerCase();
    if (c.indexOf('insurance') >= 0) return mk('Buy about ' + money(capital) + ' of cover on a large, well-known protocol from ' + name + ' on ' + chain + ' and keep the policy running to expiry rather than cancelling early', gas);
    if (c.indexOf('index') >= 0) return mk('Buy ' + money(capital) + ' of a ' + name + " index position on " + chain + " and hold it through the whole hold without rebalancing by hand — rebalancing is the index's own job", gas);
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return mk('Open a ' + name + ' account, load it with ' + money(capital) + ' and route three ordinary payments through it across the hold, so the account shows real spending rather than a single load', 1);
    if (c.indexOf('otc') >= 0) return mk('Register on ' + name + ', finish its onboarding checks and complete one small trade of about ' + money(half) + ' so the account is a trading account with a settled history', 2);
    if (c.indexOf('privacy') >= 0) return mk('Deposit ' + money(capital) + ' through ' + name + ' on ' + chain + ' in one ordinary-sized note, leave it for the hold, and withdraw to the same wallet — one clean cycle, fully documented in your farm log', 2 * gas);
    if (c.indexOf('governance') >= 0) return mk('Take the qualifying position ' + name + ' rewards on ' + chain + ' with ' + money(capital) + ' and vote in at least one governance poll during the hold from the same wallet', gas);
    if (c.indexOf('stablecoin') >= 0) return mk('Wrap ' + money(capital) + ' of the underlying stablecoin through ' + name + ' on ' + chain + ' and hold the wrapped asset in the farm wallet for the full hold', gas);
    if (c.indexOf('btc') >= 0) return mk('Deposit about ' + money(capital) + ' of BTC value through ' + name + "'s own route on " + chain + ' and hold the issued position untouched for the full hold', gas + 2);
    return mk('Deposit ' + money(capital) + ' of USDC into ' + name + ' on ' + chain + ' through its own app, in the product its front page leads with, and keep the position open for the full hold', gas);
  }
  function secondStep(row, fam, capital, chain, gas) {
    var name = row.name;
    var third = Math.round(capital / 3);
    var fifth = Math.round(capital / 5);
    function mk(text, fee, minutes) {
      return { text: text, cost: 'about ' + money(fee) + ' of fees and gas', time: (minutes || 12) + ' minutes', fee: fee, minutes: minutes || 12 };
    }
    if (fam === 'vault') return mk('Split a second tranche of about ' + money(third) + ' into a different ' + name + ' vault on ' + chain + ' — a different curator or strategy — so the wallet shows breadth across vaults, not one lucky deposit', gas);
    if (fam === 'dex') return mk("Add a second, smaller LP position of about " + money(third) + " in " + name + "'s next-deepest " + chain + ' pool and leave both positions untouched between weekly visits', 2 * gas + capital * 0.002);
    if (fam === 'perps') return mk('Roll the hedge on ' + name + ' once mid-hold: close both legs, check the funding the pair paid or earned, and reopen at the same size, so the account shows more than a single open-and-close', 2 * gas + capital * 0.001);
    if (fam === 'lending') return mk("Move the supply once to " + name + "'s second market, or to a second asset in the same market, keeping the health factor above 2 for the whole hold so the history reads as careful, not reckless", 2 * gas);
    if (fam === 'cdp') return mk("Put part of the minted stablecoin to work inside " + name + "'s own pages — a stability pool or savings rate, whichever it offers — and keep the rest liquid for a quick collateral top-up if prices fall", gas);
    if (fam === 'prediction') return mk('Settle one finished market on ' + name + ' promptly and roll the proceeds into a fresh market, so the account shows a full trade-settle-retrade cycle rather than abandoned positions', gas + 1);
    if (fam === 'bridge') return mk('Near the end of the hold, bridge a smaller ' + money(third) + ' back over a different ' + name + ' route if one exists, so the wallet carries round-trip history, not a one-way transfer', 3 + gas);
    if (fam === 'staking') return mk('Allocate a second tranche of about ' + money(third) + ' to a different validator or vault inside ' + name + ", so the wallet is not tied to a single operator's record", gas);
    if (fam === 'yield') return mk('Harvest whatever the position accrues once mid-hold and restake it in the same ' + name + ' strategy, so the wallet shows a claim-and-compound cycle as well as a deposit', gas);
    if (fam === 'rwa') return mk('Make one small secondary purchase or redemption of about ' + money(fifth) + ' mid-hold, so the wallet shows it can exit ' + name + ' as well as enter it', gas + 1);
    if (fam === 'chain') return mk("Use two more of " + name + "'s native apps during the hold — a second exchange or a lending market — so the wallet's activity spreads across the chain instead of parking in one contract", 2 * gas);
    if (fam === 'exchange') return mk('Use one more ' + name + ' product the account offers — a simple earn balance or a card payment, if it has one — with about ' + money(fifth) + ', so the account reads as a customer, not a bare signup', 1);
    var c = (row.category || '').toLowerCase();
    if (c.indexOf('insurance') >= 0) return mk('Renew or extend the ' + name + ' cover once before expiry if the hold outlasts the first policy term, keeping cover continuous for the whole hold', gas);
    if (c.indexOf('index') >= 0) return mk('Add about ' + money(fifth) + ' more to the ' + name + ' index position mid-hold, on a down week if there is one, so the wallet shows a second deliberate purchase', gas);
    if (c.indexOf('otc') >= 0) return mk('Complete a second, smaller trade of about ' + money(fifth) + ' on ' + name + ' in the opposite direction later in the hold, so the account has two-sided history', 2);
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return mk("Make one payment of a different kind through " + name + " — a card spend if the first were transfers, or the reverse — so the account's usage is not one repeated action", 1);
    return null;
  }
  function farmPlan(row) {
    var fam = familyOf(row.category);
    var chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var secondChain = row.chains.length > 1 ? row.chains[1] : null;
    var gas = gasFor(chain);
    var capital = capitalFor(row.tvl_usd);
    var hold = holdDaysFor(row.age_days);
    var weeks = Math.max(3, Math.round(hold / 7));
    var pick = slugHash(row.slug);
    var steps = [];
    var setups = [
      'Create a fresh wallet for ' + row.name + ' alone, back its seed phrase up offline, and label the wallet with the protocol\'s name and the start date so every later step is auditable',
      'Set up one dedicated wallet for this farm — never your main wallet — fund it on ' + chain + ' for ' + row.name + ' and keep a written note of why this wallet exists and what it is allowed to hold',
      'Start with a clean wallet whose only job is ' + row.name + ': generate it, store its seed phrase on paper, and send it a small test amount on ' + chain + ' before committing the full position',
    ];
    steps.push({ text: setups[pick % 3], cost: 'about ' + money(2 * gas) + ' of gas for the first test transactions on ' + chain, time: '12 minutes', fee: 2 * gas, minutes: 12 });
    var lean = row.tvl_usd < 60000000 && row.chains.length <= 2 && !row.watchlist;
    if ((capital >= 150 || row.chains.length >= 3) && !lean) {
      var reserve = Math.max(5, Math.round(6 * gas));
      steps.push({
        text: 'Move the position capital onto ' + chain + ' — ' + row.name + "'s primary chain of the " + row.chains.length + ' it lists — ' + (secondChain !== null ? 'bridging from ' + secondChain + ' or buying directly on ' + chain : 'buying USDC on ' + chain + ' directly') + ', and keep about ' + money(reserve) + " aside in the chain's gas asset so later steps never stall for fees",
        cost: 'about ' + money((secondChain !== null ? 4 : 0) + gas) + ' of bridge and gas fees',
        time: '15 minutes',
        fee: (secondChain !== null ? 4 : 0) + gas,
        minutes: 15,
      });
    }
    steps.push(coreStep(row, fam, capital, chain, gas));
    var second = secondStep(row, fam, capital, chain, gas);
    if (second !== null && !(pick % 5 === 4 && row.chains.length === 1)) steps.push(second);
    if (secondChain !== null) {
      var gas2 = gasFor(secondChain);
      steps.push({
        text: row.name + ' is live on ' + row.chains.length + ' chains; repeat a light version of the core action on ' + secondChain + ' with about ' + money(Math.round(capital / 5)) + ", so the wallet's history is not confined to " + chain + ' alone',
        cost: 'about ' + money(4 + gas2) + ' of bridge and gas fees on ' + secondChain,
        time: '15 minutes',
        fee: 4 + gas2,
        minutes: 15,
      });
    }
    var volumeFam = fam === 'dex' || fam === 'perps' || fam === 'prediction' || fam === 'exchange';
    if (volumeFam) {
      var weeklyVol = Math.max(50, Math.round(capital / 2));
      var vfee = round2(weeks * gas * 2 + weeks * weeklyVol * 0.002);
      steps.push({
        text: pick % 2 === 0
          ? 'Trade a little every week on ' + row.name + ' — about ' + money(weeklyVol) + ' of volume in small clips, in at least ' + weeks + ' separate weeks of the hold — so the account builds a volume history with a rhythm, not a single burst'
          : 'Keep a weekly rhythm on ' + row.name + ': roughly ' + money(weeklyVol) + ' of volume a week in small clips, spread over at least ' + weeks + ' separate weeks, so the history reads as a regular user\'s and not a one-day spike',
        cost: 'about ' + money(vfee) + ' of gas and trading fees across the hold, building toward ' + money(weeklyVol * weeks) + ' of cumulative volume',
        time: '10 minutes a week for ' + weeks + ' weeks',
        fee: vfee,
        minutes: 10 * weeks,
      });
    } else {
      var actionByFamily = {
        vault: 'a small top-up or a rebalance between its vaults',
        lending: 'a supply top-up, a borrow or a repayment',
        cdp: 'a collateral check, a top-up or a small mint or repay',
        bridge: 'one more small bridge over any of its routes',
        staking: 'a small extra stake or a rewards claim',
        yield: 'a harvest, a claim or a small top-up',
        rwa: 'a small mint or a balance check-in trade',
        chain: 'a swap, a payment or any gas-paying action on the chain',
      };
      var action = actionByFamily[fam] || 'a deposit, a claim or a vote';
      var rfee = round2(weeks * gas);
      steps.push({
        text: pick % 2 === 0
          ? 'Return once a week for one qualifying action on ' + row.name + ' — ' + action + ' — in at least ' + weeks + ' separate weeks of the hold, so the wallet reads as a regular, not a drive-by'
          : 'Come back weekly for one qualifying action on ' + row.name + ' — ' + action + ' — spread over at least ' + weeks + ' separate weeks, so the activity has a history and not a single burst',
        cost: 'about ' + money(rfee) + ' of gas across the hold',
        time: '10 minutes a week for ' + weeks + ' weeks',
        fee: rfee,
        minutes: 10 * weeks,
      });
    }
    var ageClause = row.age_days !== null && row.age_days !== undefined ? row.name + ' has run ' + row.age_days + ' days with no token recorded, and a hold of this length is short against that history' : 'the snapshot gives no listing date for ' + row.name + ', so the hold uses the board\'s default window';
    steps.push({
      text: pick % 2 === 0
        ? 'Hold the position for at least ' + hold + ' days, never dropping below half the opening size, so the activity is live across several of the protocol\'s own weekly snapshots; ' + ageClause
        : 'Keep the ' + row.name + ' position live for at least ' + hold + ' days and never let it fall below half the opening size, so it is present in several of the protocol\'s own weekly snapshots; ' + ageClause,
      cost: 'the ' + money(capital) + ' stays committed, plus its market and smart-contract risk',
      time: hold + ' days',
      fee: 0,
      minutes: 0,
    });
    if (pick % 3 !== 0 && (row.watchlist || row.age_days === null || row.age_days === undefined || row.age_days >= 300)) {
      steps.push({
        text: 'Open ' + row.name + "'s own points, rewards or governance page — only from a link its official site publishes — connect this same wallet, and claim or vote wherever it offers; if it offers nothing yet, save a dated screenshot of the page into the farm log as evidence of checking",
        cost: 'about ' + money(gas) + ' of gas if a claim is live; never pay a third party to claim for you',
        time: '10 minutes',
        fee: gas,
        minutes: 10,
      });
    }
    while (steps.length > 7) {
      var claimAt = -1;
      for (var ci = 0; ci < steps.length; ci++) {
        if (steps[ci].text.indexOf('Open ') === 0 && steps[ci].text.indexOf('points, rewards or governance') >= 0) { claimAt = ci; break; }
      }
      if (claimAt >= 0) steps.splice(claimAt, 1);
      else steps.splice(1, 1);
    }
    var fees = round2(steps.reduce(function (n, s) { return n + s.fee; }, 0));
    var active = steps.reduce(function (n, s) { return n + s.minutes; }, 0);
    steps.push({
      text: 'Plan total for ' + row.name + ': commit ' + money(capital) + ' of capital, expect about ' + money(fees) + ' in gas, bridge and trading fees, and ' + timeText(active) + ' of active work spread across the ' + hold + '-day hold; keep a farm log of the wallet, the dates and every transaction hash, and when the hold ends decide from that log whether to roll the capital into the next candidate on the board',
      cost: 'the ' + money(capital) + ' position plus about ' + money(fees) + ' of fees in total',
      time: timeText(active) + ' of active work over a ' + hold + '-day hold',
      fee: 0,
      minutes: 0,
    });
    return { steps: steps, capital: capital, fees: fees, active: active, hold: hold };
  }
  function stepText(step) { return step.text + '. Cost: ' + step.cost + '. Time: ' + step.time + '.'; }
  window.RADAR_API = { impliedOf: impliedOf, farmPlan: farmPlan, stepText: stepText };

  // ---------------------------------------------------------------- tiny DOM helper
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function syncUrl() {
    try {
      var p = new URLSearchParams();
      if (state.q) p.set('q', state.q);
      if (state.category !== 'all') p.set('cat', state.category);
      if (state.chain !== 'all') p.set('chain', state.chain);
      if (state.set !== 'all') p.set('set', state.set);
      if (state.tab !== 'board') p.set('tab', state.tab);
      if (state.sort !== 'implied') p.set('sort', state.sort);
      if (state.dir === 1) p.set('dir', 'asc');
      if (state.selected) p.set('detail', state.selected);
      window.history.replaceState(null, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
    } catch (e) { /* file URLs in some browsers: the view still works */ }
  }

  // ---------------------------------------------------------------- filtering and sorting
  function rowMatches(row) {
    if (state.set === 'watchlist' && !row.watchlist) return false;
    if (state.set === 'early' && row.watchlist) return false;
    if (state.category !== 'all' && (row.category || 'Uncategorized') !== state.category) return false;
    if (state.chain !== 'all' && row.chains.indexOf(state.chain) < 0) return false;
    if (state.q) {
      var q = state.q.toLowerCase();
      if (row.name.toLowerCase().indexOf(q) < 0 && row.slug.indexOf(q) < 0) return false;
    }
    return true;
  }
  var SORTS = {
    rank: function (r) { return r.rank; },
    name: function (r) { return r.name.toLowerCase(); },
    tvl: function (r) { return r.tvl_usd; },
    chg: function (r) { return r.change_7d === null ? -Infinity : r.change_7d; },
    age: function (r) { return r.age_days === null ? -1 : r.age_days; },
    implied: function (r) { return r.implied_value_usd; },
    score: function (r) { return r.radar_score; },
    mcap: function (r) { return r.mcap_usd === null ? 0 : r.mcap_usd; },
    ratio: function (r) { return r.mcap_tvl === null ? -1 : r.mcap_tvl; },
  };
  function sorted(rows) {
    var key = SORTS[state.sort] ? state.sort : 'implied';
    var get = SORTS[key];
    return rows.slice().sort(function (a, b) {
      var va = get(a), vb = get(b);
      if (va < vb) return -state.dir;
      if (va > vb) return state.dir;
      return a.rank - b.rank || (a.slug < b.slug ? -1 : 1);
    });
  }

  // ---------------------------------------------------------------- pieces of the page
  function header() {
    return el('div', { class: 'topbar' },
      el('div', { class: 'logo' }, 'Token ', el('span', { class: 'dot', text: 'Radar' })),
      el('div', { class: 'tagline', text: 'Pre-token launch candidates ranked by what their launch would be worth — and how to farm each one.' }),
      el('div', { class: 'asof' },
        el('div', null, 'Snapshot ', el('b', { text: DATA.as_of }), ' — DefiLlama, sealed'),
        el('div', { text: 'Model ' + DATA.model_version + ' — no live fetching, the same board every run' })));
  }
  function stats() {
    var top = DATA.rows[0];
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    var cards = [
      ['Protocols scanned', String(DATA.scanned), 'every protocol at $5M+ TVL'],
      ['Record no token', String(DATA.pre_token), 'the full pre-token universe'],
      ['Ranked launch candidates', String(DATA.board_size), 'pass the screen — board total ' + fmtUsd(total)],
      ['Set aside', String(DATA.set_aside_size), 'products of tokens that already trade — named, not ranked'],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'all ranked and badged'],
      ['Top implied value', fmtUsd(top.implied_value_usd), top.name],
    ];
    return el('section', { class: 'stats' }, cards.map(function (c, i) {
      return el('div', { class: 'stat' },
        el('div', { class: 'k', text: c[0] }),
        el('div', { class: 'v' + (i >= 4 ? ' teal' : ''), text: c[1] }),
        el('div', { class: 's', text: c[2] }));
    }));
  }
  function controls() {
    var cats = [];
    var chains = [];
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (cats.indexOf(c) < 0) cats.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    DATA.live.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (cats.indexOf(c) < 0) cats.push(c);
    });
    DATA.set_aside.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (cats.indexOf(c) < 0) cats.push(c);
      r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); });
    });
    cats.sort(); chains.sort();
    var catSel = el('select', { 'aria-label': 'Category', onchange: function () { state.category = catSel.value; render(); } },
      [el('option', { value: 'all', text: 'All categories' })].concat(cats.map(function (c) {
        return el('option', { value: c, text: c, selected: state.category === c ? 'selected' : null });
      })));
    var chainSel = el('select', { 'aria-label': 'Chain', onchange: function () { state.chain = chainSel.value; render(); } },
      [el('option', { value: 'all', text: 'All chains' })].concat(chains.map(function (c) {
        return el('option', { value: c, text: c, selected: state.chain === c ? 'selected' : null });
      })));
    var search = el('input', { type: 'search', placeholder: 'Search name or slug', value: state.q, 'aria-label': 'Search',
      oninput: function () { state.q = search.value; renderTable(); } });
    function pill(label, value) {
      return el('button', { class: state.set === value ? 'on' : '', onclick: function () { state.set = value; render(); } }, label);
    }
    function tab(label, value) {
      return el('button', { class: state.tab === value ? 'on' : '', onclick: function () { state.tab = value; if (value === 'live' && state.sort === 'score') state.sort = 'mcap'; render(); } }, label);
    }
    return el('div', { class: 'controls' },
      search, catSel, chainSel,
      el('span', { class: 'pills' }, pill('All', 'all'), pill('Watchlist', 'watchlist'), pill('Beyond watchlist', 'early')),
      el('span', { class: 'tabs' }, tab('Radar board', 'board'), tab('Set aside — already-trading products', 'aside'), tab('Already trading — comps', 'live')));
  }
  function th(label, key) {
    var on = state.sort === key;
    return el('th', { class: on ? 'sorted' : '', onclick: function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      render();
    } }, label + (on ? (state.dir === -1 ? ' ↓' : ' ↑') : ''));
  }
  function boardTable(rows) {
    var wide = !state.selected;
    var headCells = [th('#', 'rank'), th('Protocol', 'name')];
    if (wide) headCells.push(el('th', { text: 'Chains' }));
    headCells.push(th('TVL', 'tvl'), th('7d', 'chg'), th('No-token age', 'age'), th('Implied value', 'implied'), th('Score', 'score'));
    var head = el('thead', null, el('tr', null, headCells));
    var body = el('tbody', null, rows.map(function (r) {
      var chgCls = r.change_7d === null ? 'flat' : r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
      var cells = [
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null,
          el('span', { class: 'pname', text: r.name }),
          r.watchlist ? el('span', { class: 'wl', text: 'WATCHLIST' }) : null,
          el('div', { class: 'pcat', text: r.category || 'Uncategorized' })),
      ];
      if (wide) cells.push(el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }));
      cells.push(
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + chgCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num implied' },
          el('div', { text: fmtUsd(r.implied_value_usd) }),
          el('div', { class: 'range', text: fmtUsd(r.implied_low_usd) + ' – ' + fmtUsd(r.implied_high_usd) })),
        el('td', null, el('span', { class: 'score' },
          el('span', { class: 'bar' }, el('i', { style: 'width:' + r.radar_score + '%' })),
          el('span', { class: 'num', text: String(r.radar_score) }))));
      return el('tr', { class: state.selected === r.slug ? 'sel' : '', onclick: function () { state.selected = r.slug; render(); } }, cells);
    }));
    return el('table', null, head, body);
  }
  function liveTable(rows) {
    var head = el('thead', null, el('tr', null,
      th('Protocol', 'name'), th('Category', 'name'), th('TVL', 'tvl'), th('Market cap', 'mcap'), th('mcap / TVL', 'ratio'), th('7d', 'chg')));
    var body = el('tbody', null, rows.map(function (r) {
      var chgCls = r.change_7d === null ? 'flat' : r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
      return el('tr', null,
        el('td', null, el('span', { class: 'pname', text: r.name })),
        el('td', { class: 'pcat', text: r.category || 'Uncategorized' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl === null ? 'n/a' : r.mcap_tvl.toFixed(2) + 'x' }),
        el('td', { class: 'num ' + chgCls, text: fmtPct(r.change_7d) }));
    }));
    return el('table', null, head, body);
  }
  function asideTable(rows) {
    var head = el('thead', null, el('tr', null,
      el('th', { text: 'Protocol' }), el('th', { text: 'Category' }), el('th', { text: 'Chains' }), th('TVL', 'tvl'), th('7d', 'chg'), el('th', { text: 'Why it is set aside' })));
    var body = el('tbody', null, rows.map(function (r) {
      var chgCls = r.change_7d === null ? 'flat' : r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : 'flat';
      return el('tr', { class: 'norow' },
        el('td', null, el('span', { class: 'pname', text: r.name })),
        el('td', { class: 'pcat', text: r.category || 'Uncategorized' }),
        el('td', { class: 'chains', text: r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + chgCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'reason', text: r.reason }));
    }));
    return el('table', null, head, body);
  }
  function modelCard() {
    var g = DATA.comps[0];
    var rows = DATA.comps.map(function (c) {
      return el('tr', null,
        el('td', { text: c.category }),
        el('td', { text: String(c.comps) }),
        el('td', { text: c.median === null ? 'n/a' : c.median.toFixed(2) + 'x' }),
        el('td', { text: c.multiple.toFixed(2) + 'x' }));
    });
    return el('div', { class: 'panel card' },
      el('h2', { text: 'The value model — ' + DATA.model_version }),
      el('p', null, 'A launch is priced from the snapshot itself: protocols whose token already trades give each category a ', el('b', { text: 'market-cap / TVL multiple' }), ' (global median ', el('b', { text: g.multiple.toFixed(2) + 'x' }), ' over ', el('b', { text: String(g.comps) }), ' live comps), shrunk toward that median where a category has few comps. The band under each value is the same shrinkage applied to the category\'s middle half of ratios.'),
      el('div', { class: 'formula', text: 'implied = TVL x category multiple x growth x maturity x breadth' }),
      el('p', null, el('b', { text: 'Growth' }), ' reads the 7-day TVL change, ', el('b', { text: 'maturity' }), ' how long the protocol has run with no token recorded, ', el('b', { text: 'breadth' }), ' how many chains it is live on. No name is special-cased: open any row and the page recomputes its value and its range from these figures.'),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Comps' }), el('th', { text: 'Median' }), el('th', { text: 'Used' }))),
        el('tbody', null, rows)),
      el('p', { class: 'note', text: 'Token-bearing protocols are never ranked. They sit in Already trading — comps, at the market\'s own value: they are the evidence, not the candidates.' }),
      el('p', { class: 'note', text: 'The screen: of the ' + DATA.pre_token + ' protocols that record no token, ' + DATA.set_aside_size + ' are products of a token that already trades — a Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC or CEX category, a name ending in a version marker, a name carrying the whole word wrapped, staked or staking, or a name beginning with an exchange\'s name. They are set aside by name in Set aside — already-trading products, each with its reason: not ranked, no implied launch value, no farm plan. The other ' + DATA.board_size + ' are the launch candidates the board ranks.' }));
  }
  function detailCard(row) {
    var v = impliedOf(row);
    var plan = farmPlan(row);
    var kv = [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Implied launch value', fmtUsd(row.implied_value_usd)],
      ['Radar score', String(row.radar_score) + ' / 99'],
      ['No-token age', fmtAge(row.age_days)],
      ['TVL change, 7d', fmtPct(row.change_7d)],
      ['Tracked since', row.listed_at || 'unreported'],
    ];
    return el('div', { class: 'panel card detail' },
      el('button', { class: 'close', 'aria-label': 'Close detail', onclick: function () { state.selected = null; render(); } }, '×'),
      el('h2', { text: row.name }),
      el('div', { class: 'sub', text: (row.category || 'Uncategorized') + ' — ' + row.chains.join(', ') }),
      el('div', null,
        el('span', { class: 'badge', text: 'PRE-TOKEN — records no token' }),
        row.watchlist ? el('span', { class: 'badge amber', text: 'WATCHLIST' }) : el('span', { class: 'badge violet', text: 'BEYOND WATCHLIST' }),
        el('span', { class: 'badge', text: 'RANK #' + row.rank })),
      el('div', { class: 'kv' }, kv.map(function (pair) {
        return el('div', null, el('div', { class: 'k', text: pair[0] }), el('div', { class: 'v', text: pair[1] }));
      })),
      el('div', { class: 'arith' },
        el('div', { class: 'row' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'row' }, el('span', { text: 'x category multiple (' + (row.category || 'Uncategorized') + ', ' + v.comps + (v.comps === 1 ? ' live comp' : ' live comps') + ', median ' + (v.median === null ? 'n/a' : v.median.toFixed(2) + 'x') + ')' }), el('b', { text: v.multiple.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x growth (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { text: v.growth.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x maturity (' + fmtAge(row.age_days) + ' with no token recorded)' }), el('b', { text: v.maturity.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x breadth (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')' }), el('b', { text: v.breadth.toFixed(2) + 'x' })),
        el('div', { class: 'row total' }, el('span', { text: 'Implied launch value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'row band' }, el('span', { text: 'Range — category middle half (' + (v.q1 === null ? 'n/a' : v.q1.toFixed(2) + 'x') + ' to ' + (v.q3 === null ? 'n/a' : v.q3.toFixed(2) + 'x') + ' before shrinkage)' }), el('b', { text: fmtUsd(v.low) + ' – ' + fmtUsd(v.high) })),
        el('div', { class: 'check', text: v.implied === row.implied_value_usd && v.low === row.implied_low_usd && v.high === row.implied_high_usd
          ? 'Recomputed in this page from the figures above: value and range match board.json to the dollar.'
          : 'Recomputed in this page: ' + fmtUsd(v.implied) + ', range ' + fmtUsd(v.low) + ' – ' + fmtUsd(v.high) + ' (board.json carries ' + fmtUsd(row.implied_value_usd) + ', ' + fmtUsd(row.implied_low_usd) + ' – ' + fmtUsd(row.implied_high_usd) + ').' })),
      el('p', { class: 'note', text: 'If a launch gave ' + Math.round(M.community_share * 100) + '% to the community, the drop pool on this value would be about ' + fmtUsd(row.drop_pool_usd) + ' — a scenario on the model\'s value, not a promise.' }),
      el('h2', { text: 'Farm plan' }),
      el('div', { class: 'totals' },
        el('span', { class: 'total-chip' }, 'Capital ', el('b', { text: money(plan.capital) })),
        el('span', { class: 'total-chip' }, 'Est. fees ', el('b', { text: money(plan.fees) })),
        el('span', { class: 'total-chip' }, 'Active time ', el('b', { text: timeText(plan.active) })),
        el('span', { class: 'total-chip' }, 'Hold ', el('b', { text: plan.hold + ' days' }))),
      el('ol', { class: 'steps' }, plan.steps.map(function (s) {
        return el('li', null,
          el('div', { text: s.text + '.' }),
          el('div', { class: 'chips' },
            el('span', { class: 'chip' }, 'Cost: ', el('b', { text: s.cost })),
            el('span', { class: 'chip' }, 'Time: ', el('b', { text: s.time }))));
      })),
      el('p', { class: 'note', text: 'The snapshot records no token for this protocol. That is DefiLlama\'s record, not proof none exists — check the protocol\'s own channels before you farm.' }));
  }

  // ---------------------------------------------------------------- render
  var boardHost = null;
  var tableHost = null;
  var railHost = null;
  function currentRows() {
    if (state.tab === 'aside') {
      var arows = DATA.set_aside.filter(function (r) {
        if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
        if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
        if (state.q) {
          var q = state.q.toLowerCase();
          if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
        }
        return true;
      });
      if (state.sort === 'name') arows.sort(function (a, b) { return state.dir * (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
      else if (state.sort === 'chg') arows.sort(function (a, b) { return state.dir * ((a.change_7d === null ? -Infinity : a.change_7d) - (b.change_7d === null ? -Infinity : b.change_7d)); });
      else arows.sort(function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1); });
      return arows;
    }
    if (state.tab === 'live') {
      var rows = DATA.live.filter(function (r) {
        if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
        if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
        if (state.q) {
          var q = state.q.toLowerCase();
          if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.indexOf(q) < 0) return false;
        }
        return true;
      });
      return sorted(rows);
    }
    return sorted(DATA.rows.filter(rowMatches));
  }
  function renderTable() {
    if (!tableHost) return;
    var rows = currentRows();
    var countText = state.tab === 'live'
      ? rows.length + ' live-token protocols shown of ' + DATA.live_size + ' carried — the comps set, at the market\'s own values, never ranked'
      : state.tab === 'aside'
        ? rows.length + ' of ' + DATA.set_aside_size + ' set-aside protocols — products of tokens that already trade: named with their reason, not ranked, no implied value and no farm plan'
        : rows.length + ' of ' + DATA.board_size + ' ranked launch candidates — of ' + DATA.pre_token + ' protocols that record no token, ' + DATA.set_aside_size + ' set aside as products of tokens that already trade; rank is the model\'s claim, sorting is yours';
    tableHost.replaceChildren(
      el('div', { class: 'count', text: countText }),
      rows.length === 0
        ? el('div', { class: 'empty', text: 'No protocol matches this filter. Loosen the search, the category or the chain.' })
        : (state.tab === 'live' ? liveTable(rows) : state.tab === 'aside' ? asideTable(rows) : boardTable(rows)));
    syncUrl();
  }
  function renderControls() {
    if (!boardHost || !tableHost) return;
    boardHost.replaceChildren(controls(), tableHost);
  }
  function renderRail() {
    if (!railHost) return;
    var kids = [];
    var sel = state.selected ? DATA.rows.find(function (r) { return r.slug === state.selected; }) : null;
    if (sel) kids.push(detailCard(sel));
    kids.push(modelCard());
    railHost.replaceChildren.apply(railHost, kids);
    var layout = railHost.parentNode;
    if (layout) layout.className = 'layout' + (sel ? ' detail-open' : '');
  }
  function render() { renderControls(); renderTable(); renderRail(); }
  function renderAll() {
    app.replaceChildren(
      header(),
      stats(),
      el('div', { class: 'layout' },
        el('section', { class: 'panel', id: 'boardPanel' }),
        el('aside', { class: 'rail', id: 'rail' })),
      el('footer', null,
        el('b', { text: 'How to read this board. ' }),
        'Of the 342 protocols that record no token in the sealed snapshot, 198 are ranked as launch candidates — the 40 watchlist protocols among them, badged — and 144 are set aside as products of tokens that already trade, each named with its reason in the set-aside view: not ranked, no implied value, no farm plan. The implied value is this board\'s own model claim about what a launch would be worth if the protocol\'s record stayed as it is; it is not a prediction that a token will be issued, and it is not make.fun\'s claim. ',
        el('b', { text: 'Source: ' }), DATA.source + '. The board is regenerated from that snapshot by main.ts on every run — the same input writes the same board, byte for byte.'));
    boardHost = document.getElementById('boardPanel');
    railHost = document.getElementById('rail');
    tableHost = el('div', null);
    render();
    app.setAttribute('aria-busy', 'false');
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.selected) { state.selected = null; render(); }
  });
  renderAll();
})();
