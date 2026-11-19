// Launch Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts from the
// sealed snapshot) and renders the ranked board, a filterable and sortable table, a per-protocol
// detail view with the model's arithmetic and the protocol's farm plan, and a comps view of the
// protocols whose token already trades. No network: every byte it shows is in data.js.
//
// The value model, restated so the page can recompute every row it shows (impliedOf below):
//   multiple(category) = the median market-cap/TVL of the snapshot's live-token protocols in the
//     category, shrunk toward the global median by the comp count, (n x median + 8 x global)/(n + 8),
//     clamped to [0.08, 1.50]; a category with no live comps uses the global median.
//   implied = TVL x multiple x growthMult x maturityMult x breadthMult, with
//     growthMult   = 1 + clamp(change_7d, -50, 100)/100 x 0.45   (unreported growth: neutral)
//     maturityMult = 0.78 + 0.44 x min(age_days, 1460)/1460      (age unreported: 0.95)
//     breadthMult  = 1 + 0.025 x min(chains - 1, 8)
//   Factors are rounded to 4 decimals before the multiplication, exactly as lib/model.ts rounds
//   them, so the number this page recomputes is the number board.json carries.
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
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // ---------------------------------------------------------------- the model, in the page
  function multipleOf(category) {
    var key = category || 'Uncategorized';
    for (var i = 0; i < DATA.comps.length; i++) if (DATA.comps[i].category === key) return DATA.comps[i];
    return { category: key, comps: 0, median: null, multiple: DATA.global_multiple };
  }
  function impliedOf(row) {
    var comp = multipleOf(row.category);
    var growthPct = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, M.growth_floor, M.growth_cap);
    var growth = round4(1 + (growthPct / 100) * M.growth_weight);
    var maturity = row.age_days === null || row.age_days === undefined
      ? M.unknown_age_mult
      : round4(M.maturity_base + (Math.min(row.age_days, M.maturity_days) / M.maturity_days) * M.maturity_range);
    var breadth = round4(1 + M.breadth_step * Math.min(Math.max(row.chains.length - 1, 0), M.breadth_max_extra));
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * comp.multiple * growth * maturity * breadth)),
      multiple: comp.multiple, comps: comp.comps, growth: growth, maturity: maturity, breadth: breadth,
    };
  }

  // ---------------------------------------------------------------- the farm plan, in the page
  // The same generator lib/model.ts runs for board.json: category, first chain, TVL tier and age in,
  // six steps out, each with its cost and time. The detail view shows this plan; board.json holds it.
  function slugHash(slug) {
    var h = 0x811c9dc5;
    for (var i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function gasFor(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return 12;
    if (c === 'solana') return 0.1;
    if (c === 'base' || c === 'arbitrum' || c === 'op mainnet' || c === 'optimism') return 0.5;
    if (c === 'bsc' || c === 'binance' || c === 'polygon' || c === 'avalanche' || c === 'fantom') return 0.3;
    return 1.5;
  }
  function gasText(g) { return g < 1 ? 'under $1' : 'about $' + g; }
  function capitalFor(tvl) {
    if (tvl >= 1e9) return 250;
    if (tvl >= 1e8) return 150;
    if (tvl >= 2.5e7) return 100;
    return 60;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function coreAction(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('dex') >= 0) return 'Swap about $' + Math.round(capital / 2) + ' of USDC for ETH and back on ' + name + "'s main market on " + chain + ', then provide the rest as liquidity in its deepest USDC pool';
    if (c.indexOf('lending') >= 0 || c.indexOf('uncollateralized') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ', then borrow about $' + Math.round(capital / 3) + ' against it once so both sides of the market see the wallet';
    if (c.indexOf('cdp') >= 0) return 'Deposit $' + capital + ' of ETH or a liquid staking token as collateral on ' + name + ' on ' + chain + ' and mint a modest amount of its stablecoin against it';
    if (c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('interest rate') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position, long and short the same size, so the wallet books volume without directional risk';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' run by a named curator, and keep the vault shares in the wallet';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of ' + name + "'s yield-bearing asset on " + chain + ' with USDC and hold the asset in the wallet';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis-trading vault on " + chain + ' and keep the position through a full funding cycle';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Stake $' + capital + ' of ETH or its liquid staking token through ' + name + ' on ' + chain + ' and keep the receipt token unsold';
    if (c === 'chain') return 'Bridge $' + capital + ' of USDC to ' + name + ' itself, then make the wallet a regular on the chain: pay gas, swap on its main exchange and hold a small balance there';
    if (c.indexOf('prediction') >= 0) return 'Fund the wallet with $' + capital + ' and take one position on each side of two liquid markets on ' + name + ', sized under $' + Math.round(capital / 5) + ' a side';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover on a large protocol from ' + name + ' on ' + chain + ' and keep the policy to expiry';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Open a ' + name + ' account, load it with $' + capital + ' and route two ordinary payments through it so the wallet shows real usage';
    if (c.indexOf('stablecoin') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset ' + name + ' issues on ' + chain + ' and hold it in the wallet';
    if (c.indexOf('index') >= 0) return 'Buy $' + capital + ' of a ' + name + ' index position on ' + chain + ' and hold it rather than trading in and out';
    if (c.indexOf('otc') >= 0) return 'Register on ' + name + ', complete its checks and make one small trade of about $' + Math.round(capital / 2) + ' so the account is a trading account';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0 || c.indexOf('leveraged') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s main vault on " + chain + ' and leave the position compounding';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' through its own app and keep the position open';
  }
  function isVolumeCategory(row) {
    var c = (row.category || '').toLowerCase();
    return c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('prediction') >= 0 || c.indexOf('otc') >= 0;
  }
  function farmPlan(row) {
    var chain = row.chains.length > 0 ? row.chains[0] : 'its main chain';
    var gas = gasFor(chain);
    var capital = capitalFor(row.tvl_usd);
    var hold = holdDaysFor(row.age_days);
    var pick = slugHash(row.slug);
    var weekly = pick % 2 === 0
      ? 'Repeat one qualifying action every week - a deposit, a swap, a borrow or a vote - in at least three separate weeks of the hold, so the wallet reads as a regular, not a drive-by'
      : 'Come back once a week for one qualifying action - a top-up, a swap, a borrow or a vote - spread over at least three separate weeks, so the activity has a history and not a single burst';
    var weeklyCost = isVolumeCategory(row)
      ? 'about $' + Math.max(2, Math.round(gas * 2)) + ' of gas a week, building toward $' + (capital * 20).toLocaleString('en-US') + ' of cumulative volume over the hold'
      : 'about $' + Math.max(1, Math.round(gas)) + ' of gas a week';
    return [
      { text: 'Set up a fresh wallet for ' + row.name + ' alone, fund it on ' + chain + ' with the position capital plus gas money, and keep its seed phrase offline', cost: 'under $' + Math.max(2, Math.round(gas)) + ' for the first transactions', time: '10 minutes' },
      { text: coreAction(row, capital, chain), cost: '$' + capital + ' of capital and ' + gasText(gas) + ' of gas', time: '15 minutes to set up' },
      { text: weekly, cost: weeklyCost, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days without withdrawing below half the deposit, so the activity is live in more than one weekly snapshot of the protocol', cost: 'the $' + capital + ' stays in the position, plus its market risk', time: hold + ' days' },
      { text: 'Open ' + row.name + "'s own points, rewards or governance page from the link its official site publishes, connect the same wallet, and claim or vote wherever the page offers it", cost: 'nothing to check; never pay a third party to claim', time: '10 minutes' },
      { text: 'Keep a farm log of the wallet, the dates and every transaction hash, and review it monthly: if no launch signal has come in two quarters, unwind the position and move the capital to the next row of the board', cost: 'nothing but the log', time: '5 minutes a month' },
    ];
  }
  function stepText(step) { return step.text + '. Cost: ' + step.cost + '. Time: ' + step.time + '.'; }

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
      el('div', { class: 'logo' }, 'Launch ', el('span', { class: 'dot', text: 'Radar' })),
      el('div', { class: 'tagline', text: 'Pre-token protocols ranked by what their launch would be worth - and how to farm each one.' }),
      el('div', { class: 'asof' },
        el('div', null, 'Snapshot ', el('b', { text: DATA.as_of }), ' - DefiLlama, sealed'),
        el('div', { text: 'Model ' + DATA.model_version + ' - no live fetching, the same board every run' })));
  }
  function stats() {
    var top = DATA.rows[0];
    var total = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    var cards = [
      ['Protocols scanned', String(DATA.scanned), 'every protocol at $5M+ TVL'],
      ['Record no token', String(DATA.pre_token), 'the pre-token universe'],
      ['Ranked on the board', String(DATA.board_size), DATA.watchlist_size + ' watchlist + ' + DATA.early_size + ' early'],
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, 'the floor, held whole'],
      ['Top implied value', fmtUsd(top.implied_value_usd), top.name],
      ['Board total implied', fmtUsd(total), 'across ' + DATA.board_size + ' ranked protocols'],
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
      el('span', { class: 'pills' }, pill('All', 'all'), pill('Watchlist', 'watchlist'), pill('Early radar', 'early')),
      el('span', { class: 'tabs' }, tab('Radar board', 'board'), tab('Already trading', 'live')));
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
        el('td', { class: 'num implied', text: fmtUsd(r.implied_value_usd) }),
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
      el('h2', { text: 'The value model - ' + DATA.model_version }),
      el('p', null, 'A launch is priced from the snapshot itself: protocols whose token already trades give each category a ', el('b', { text: 'market-cap / TVL multiple' }), ' (global median ', el('b', { text: g.multiple.toFixed(2) + 'x' }), ' over ', el('b', { text: String(g.comps) }), ' live comps), shrunk toward that median where a category has few comps.'),
      el('div', { class: 'formula', text: 'implied = TVL x category multiple x growth x maturity x breadth' }),
      el('p', null, el('b', { text: 'Growth' }), ' reads the 7-day TVL change, ', el('b', { text: 'maturity' }), ' how long the protocol has run with no token, ', el('b', { text: 'breadth' }), ' how many chains it is live on. No name is special-cased: open any row and the page recomputes its value from these figures.'),
      el('table', { class: 'comps' },
        el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { text: 'Comps' }), el('th', { text: 'Median' }), el('th', { text: 'Used' }))),
        el('tbody', null, rows)),
      el('p', { class: 'note', text: 'Token-bearing protocols are never ranked. They sit in Already trading at the market\'s own value - they are the comps, not the candidates.' }));
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
      el('div', { class: 'sub', text: (row.category || 'Uncategorized') + ' - ' + row.chains.join(', ') }),
      el('div', null,
        el('span', { class: 'badge', text: 'PRE-TOKEN - records no token' }),
        row.watchlist ? el('span', { class: 'badge amber', text: 'WATCHLIST' }) : el('span', { class: 'badge', text: 'EARLY RADAR' }),
        el('span', { class: 'badge', text: 'RANK #' + row.rank })),
      el('div', { class: 'kv' }, kv.map(function (pair) {
        return el('div', null, el('div', { class: 'k', text: pair[0] }), el('div', { class: 'v', text: pair[1] }));
      })),
      el('div', { class: 'arith' },
        el('div', { class: 'row' }, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', { class: 'row' }, el('span', { text: 'x category multiple (' + (row.category || 'Uncategorized') + ', ' + v.comps + (v.comps === 1 ? ' comp' : ' comps') + ')' }), el('b', { text: v.multiple.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x growth (7d ' + fmtPct(row.change_7d) + ')' }), el('b', { text: v.growth.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x maturity (' + fmtAge(row.age_days) + ' with no token)' }), el('b', { text: v.maturity.toFixed(2) + 'x' })),
        el('div', { class: 'row' }, el('span', { text: 'x breadth (' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + ')' }), el('b', { text: v.breadth.toFixed(2) + 'x' })),
        el('div', { class: 'row total' }, el('span', { text: 'Implied launch value' }), el('b', { text: fmtUsd(row.implied_value_usd) })),
        el('div', { class: 'check', text: v.implied === row.implied_value_usd
          ? 'Recomputed in this page from the figures above: matches board.json to the dollar.'
          : 'Recomputed in this page: ' + fmtUsd(v.implied) + ' (board.json carries ' + fmtUsd(row.implied_value_usd) + ').' })),
      el('p', { class: 'note', text: 'If a launch gave ' + Math.round(M.community_share * 100) + '% to the community, the drop pool on this value would be about ' + fmtUsd(row.drop_pool_usd) + ' - a scenario on the model\'s value, not a promise.' }),
      el('h2', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, plan.map(function (s) {
        return el('li', null,
          el('div', { text: s.text + '.' }),
          el('div', { class: 'chips' },
            el('span', { class: 'chip' }, 'Cost: ', el('b', { text: s.cost })),
            el('span', { class: 'chip' }, 'Time: ', el('b', { text: s.time }))));
      })),
      el('p', { class: 'note', text: 'The snapshot records no token for this protocol. That is DefiLlama\'s record, not proof none exists - check the protocol\'s own channels before you farm.' }));
  }

  // ---------------------------------------------------------------- render
  var boardHost = null;
  var tableHost = null;
  var railHost = null;
  function currentRows() {
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
      ? rows.length + ' live-token protocols shown of ' + DATA.live_size + ' carried - the market\'s own values, the comps behind the model'
      : rows.length + ' of ' + DATA.board_size + ' ranked protocols - ranked by implied value; rank is the model\'s claim, sorting is yours';
    tableHost.replaceChildren(
      el('div', { class: 'count', text: countText }),
      rows.length === 0
        ? el('div', { class: 'empty', text: 'No protocol matches this filter. Loosen the search, the category or the chain.' })
        : (state.tab === 'live' ? liveTable(rows) : boardTable(rows)));
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
        'Every ranked protocol records no token in the sealed snapshot and is not a wrapped, staked or bridged product of one that trades. The implied value is this board\'s own model claim about what a launch would be worth if the protocol\'s record stayed as it is; it is not a prediction that a token will be issued, and it is not make.fun\'s claim. ',
        el('b', { text: 'Source: ' }), DATA.source + '. The board is regenerated from that snapshot by main.ts on every run - the same input writes the same board, byte for byte.'));
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
