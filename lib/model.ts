// Token Radar v2 model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// Coverage. The snapshot holds 342 protocols that record no token — DefiLlama's record carries
// neither a CoinGecko id nor a symbol for them. They are classified, never silently dropped:
// a pre-token protocol that is a product of a token that already trades is SET ASIDE, named in
// the dashboard with its specific reason, and carries no implied value and no farm plan. The
// screen is the watchlist rule's own (see setAsideReason): a product category (Bridge, Canonical
// Bridge, Liquid Staking, Liquid Restaking, Restaked BTC, CEX), a name ending in a version
// marker, a name carrying the whole word wrapped, staked or staking, or a name beginning with
// an exchange's name. The board ranks only the launch candidates that pass — 198 of the 342 —
// and the other 144 are set aside. Every one of the 40 watchlist protocols passes the screen
// and is ranked and badged (boardIssue verifies the coverage). Protocols whose token already
// trades are never ranked either; they are the comps set, shown apart in the dashboard at the
// market's own values, and they price the model below.
//
// Implied value. A launch is priced only from the snapshot's own figures — no protocol name is
// special-cased anywhere in this file:
//
//   multiple(category) = the median market-cap/TVL of the snapshot's live-token protocols in the
//                        category, shrunk toward the global median by the comp count,
//                        (n x median + 8 x global) / (n + 8), clamped to [0.08, 1.50]; a category
//                        with no live comps uses the global median.
//   range(category)    = the same shrinkage applied to the category ratios' first and third
//                        quartiles, so each row carries a low/base/high band whose width is the
//                        category's own observed spread, not a fixed percentage.
//   growthMult         = 1 + clamp(change_7d, -50, 100) / 100 x 0.45   (unreported: neutral)
//   maturityMult       = 0.78 + 0.44 x min(age_days, 1460) / 1460      (age unreported: 0.95)
//   breadthMult        = 1 + 0.025 x min(chains - 1, 8)
//   implied_value_usd  = max(1, round(tvl x multiple x growth x maturity x breadth))
//   implied low/high   = the same product with the range's low/high multiple.
//
// Factors are rounded to 4 decimals before the multiplication, so the dashboard's own copy of
// this arithmetic (dashboard/app.js) lands on the same dollar the board carries.
//
// Farm plans. Each plan is generated from the protocol's category family (vaults and curators,
// DEX, perps, lending, CDP, prediction, bridges, staking, yield, RWA, chains, exchanges, other),
// its real primary and secondary chains, its chain count, its TVL tier and its no-token age.
// Plans run 5 to 8 steps; every step states its cost and its time; the last step is a summary
// carrying the plan's totals — capital committed, estimated fees, active time, hold length —
// which the board row also carries as numbers for the detail view.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can check the arithmetic. */
export interface ModelConstants {
  shrink_k: number;
  multiple_floor: number;
  multiple_cap: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_base: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_mult: number;
  breadth_step: number;
  breadth_max_extra: number;
  community_share: number;
}

export const MODEL: ModelConstants = {
  shrink_k: 8,
  multiple_floor: 0.08,
  multiple_cap: 1.5,
  growth_weight: 0.45,
  growth_floor: -50,
  growth_cap: 100,
  maturity_base: 0.78,
  maturity_range: 0.44,
  maturity_days: 1460,
  unknown_age_mult: 0.95,
  breadth_step: 0.025,
  breadth_max_extra: 8,
  community_share: 0.1,
};

/** The model's version label, named in the dashboard beside the constants. */
export const MODEL_VERSION = 'token-radar-2';

/** How many live-token protocols the dashboard's comps view carries, by market cap. */
export const LIVE_ROWS = 36;

/**
 * One category's comp evidence: how many live protocols price it, the median and the middle
 * half (first/third quartile) of their market-cap/TVL ratios, and the shrunk multiples used.
 */
export interface CompRow {
  category: string;
  comps: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  multiple: number;
  multiple_low: number;
  multiple_high: number;
}

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  token_status: 'pre-token';
  watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  radar_score: number;
  model: {
    multiple: number;
    multiple_low: number;
    multiple_high: number;
    comps: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_capital_usd: number;
  farm_fees_usd: number;
  farm_active_minutes: number;
  farm_hold_days: number;
  farm_steps: string[];
}

/** The dashboard's view of one board row: the raw figures, so the page recomputes the value itself. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  radar_score: number;
  drop_pool_usd: number;
}

/**
 * A pre-token protocol set aside by the screen: a product of a token that already trades.
 * It is named in the dashboard with its reason; it is not ranked and carries no implied
 * launch value and no farm plan.
 */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  reason: string;
}

/** A live-token protocol: it already trades, so the page shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  mcap_tvl: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_multiple: number;
  comps: CompRow[];
  scanned: number;
  pre_token: number;
  board_size: number;
  watchlist_size: number;
  early_size: number;
  set_aside_size: number;
  live_size: number;
  live_total: number;
  rows: RadarRow[];
  set_aside: SetAsideRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

export const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token: the snapshot carries neither a CoinGecko id nor a symbol for it. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked, bridged or exchange product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a product may begin with (the watchlist's rule). */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Why a pre-token protocol is set aside as a product of a token that already trades, or null
 * when it is a launch candidate the board ranks. The watchlist rule's own screen, judged from
 * the snapshot's fields, in its own order: product category, version marker, the whole word
 * wrapped/staked/staking, an exchange name the name begins with. The reason is specific, so
 * the dashboard can name exactly why each set-aside protocol is not a candidate.
 */
export function setAsideReason(p: SnapshotProtocol): string | null {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) {
    if (p.category === 'CEX') return `exchange product (category: CEX)`;
    return `wrapped or staked product (category: ${p.category})`;
  }
  const version = VERSIONED.exec(p.name);
  if (version !== null) return `versioned product (name ends in the version marker "${version[1]}")`;
  const word = /\b(wrapped|staked|staking)\b/i.exec(p.name);
  if (word !== null) return `wrapped or staked product (name carries the word "${word[1]!.toLowerCase()}")`;
  const exchange = EXCHANGE_PREFIXES.find((e) => p.name.startsWith(e));
  if (exchange !== undefined) return `exchange product (name begins with ${exchange})`;
  return null;
}

/** Whether a pre-token protocol passes the screen and is a launch candidate the board ranks. */
export function passesScreen(p: SnapshotProtocol): boolean {
  return setAsideReason(p) === null;
}

/** Every pre-token protocol the screen sets aside, largest first, each with its specific reason. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  const rows: SetAsideRow[] = [];
  for (const p of snapshot.protocols) {
    if (!isPreToken(p)) continue;
    const reason = setAsideReason(p);
    if (reason === null) continue;
    rows.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(snapshot.as_of, p.listed_at),
      reason,
    });
  }
  rows.sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return rows;
}

/** A quantile of a sorted, non-empty list (linear interpolation between closest ranks). */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base]! : sorted[base]! + (next - sorted[base]!) * rest;
}

/**
 * The category multiples, priced by the snapshot's own live-token protocols: for each category,
 * the median market-cap/TVL of its live protocols and the middle half of those ratios, each
 * shrunk toward the matching global statistic and clamped. The global row comes first, then
 * every category the board ranks, in name order.
 */
export function compMultiples(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
): { global: number; table: CompRow[]; forCategory: (category: string | null) => CompRow } {
  const ratiosByCategory = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (isPreToken(p) || p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    const key = p.category ?? 'Uncategorized';
    const list = ratiosByCategory.get(key);
    if (list === undefined) ratiosByCategory.set(key, [ratio]);
    else list.push(ratio);
  }
  all.sort((a, b) => a - b);
  const gMedian = all.length > 0 ? quantile(all, 0.5) : 0.2;
  const gQ1 = all.length > 0 ? quantile(all, 0.25) : 0.1;
  const gQ3 = all.length > 0 ? quantile(all, 0.75) : 0.4;
  const clampMult = (n: number): number => round4(clamp(n, model.multiple_floor, model.multiple_cap));
  const globalRow: CompRow = {
    category: 'All categories (global)',
    comps: all.length,
    median: round4(gMedian),
    q1: round4(gQ1),
    q3: round4(gQ3),
    multiple: clampMult(gMedian),
    multiple_low: clampMult(gQ1),
    multiple_high: clampMult(gQ3),
  };
  globalRow.multiple_low = Math.min(globalRow.multiple_low, globalRow.multiple);
  globalRow.multiple_high = Math.max(globalRow.multiple_high, globalRow.multiple);
  const rowFor = (category: string | null): CompRow => {
    const key = category ?? 'Uncategorized';
    const list = ratiosByCategory.get(key);
    if (list === undefined || list.length === 0) {
      // No live protocol prices this category: the row says so plainly (0 comps, no median of
      // its own) and borrows the global multiples, rather than dressing the global evidence up
      // as the category's own.
      return { category: key, comps: 0, median: null, q1: null, q3: null, multiple: globalRow.multiple, multiple_low: globalRow.multiple_low, multiple_high: globalRow.multiple_high };
    }
    const s = [...list].sort((a, b) => a - b);
    const n = s.length;
    const shrink = (stat: number, globalStat: number): number => clampMult((n * stat + model.shrink_k * globalStat) / (n + model.shrink_k));
    const row: CompRow = {
      category: key,
      comps: n,
      median: round4(quantile(s, 0.5)),
      q1: round4(quantile(s, 0.25)),
      q3: round4(quantile(s, 0.75)),
      multiple: shrink(quantile(s, 0.5), gMedian),
      multiple_low: shrink(quantile(s, 0.25), gQ1),
      multiple_high: shrink(quantile(s, 0.75), gQ3),
    };
    row.multiple_low = Math.min(row.multiple_low, row.multiple);
    row.multiple_high = Math.max(row.multiple_high, row.multiple);
    return row;
  };
  const boardCategories = new Set<string>();
  for (const p of snapshot.protocols) if (isPreToken(p) && passesScreen(p)) boardCategories.add(p.category ?? 'Uncategorized');
  const table: CompRow[] = [globalRow];
  for (const category of [...boardCategories].sort()) table.push(rowFor(category));
  return { global: globalRow.multiple, table, forCategory: rowFor };
}

/** The model's factors for one protocol, each rounded as the dashboard rounds them. */
export function modelFactors(
  p: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(p.change_7d ?? 0, model.growth_floor, model.growth_cap);
  const growthMult = round4(1 + (growthPct / 100) * model.growth_weight);
  const maturityMult =
    age === null ? model.unknown_age_mult : round4(model.maturity_base + (Math.min(age, model.maturity_days) / model.maturity_days) * model.maturity_range);
  const breadthMult = round4(1 + model.breadth_step * Math.min(Math.max(p.chains.length - 1, 0), model.breadth_max_extra));
  return { growthMult, maturityMult, breadthMult, age };
}

/** The implied launch value of one protocol and its low/high band, in whole dollars. */
export function impliedValues(
  p: SnapshotProtocol,
  asOf: string,
  comp: CompRow,
  model: ModelConstants = MODEL,
): { base: number; low: number; high: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const f = modelFactors(p, asOf, model);
  const at = (multiple: number): number => Math.max(1, Math.round(p.tvl_usd * multiple * f.growthMult * f.maturityMult * f.breadthMult));
  const base = at(comp.multiple);
  return { base, low: Math.min(at(comp.multiple_low), base), high: Math.max(at(comp.multiple_high), base), ...f };
}

/**
 * A 1..99 radar score for display only (the ranking is by implied value): half the protocol's
 * size on a log scale, a quarter its 7-day growth, a quarter how long it has run with no token.
 */
export function radarScore(p: SnapshotProtocol, age: number | null): number {
  const size = clamp((Math.log10(Math.max(p.tvl_usd, 1)) - Math.log10(5_000_000)) / (Math.log10(3_000_000_000) - Math.log10(5_000_000)), 0, 1);
  const growth = (clamp(p.change_7d ?? 0, -50, 100) + 50) / 150;
  const seasoned = Math.min(age ?? 365, 1460) / 1460;
  return clamp(Math.round(100 * (0.5 * size + 0.25 * growth + 0.25 * seasoned)), 1, 99);
}

// ---------------------------------------------------------------- farm plans

/** The category families whose mechanics shape a plan's skeleton. */
export type Family = 'vault' | 'dex' | 'perps' | 'lending' | 'cdp' | 'prediction' | 'bridge' | 'staking' | 'yield' | 'rwa' | 'chain' | 'exchange' | 'other';

/** Which family a category's mechanics belong to. Pure category text in, family out — never a name. */
export function familyOf(category: string | null): Family {
  const c = (category ?? '').toLowerCase();
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager') || c.includes('yield aggregator') || c.includes('options vault')) return 'vault';
  if (c.includes('dex')) return 'dex';
  if (c.includes('derivative') || c.includes('perpetual')) return 'perps';
  if (c.includes('cdp') || c.includes('dual-token')) return 'cdp';
  if (c.includes('lending') || c.includes('collateral')) return 'lending';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak')) return 'staking';
  if (c.includes('rwa')) return 'rwa';
  if (c === 'chain') return 'chain';
  if (c.includes('cex') || c.startsWith('cede')) return 'exchange';
  if (c.includes('yield') || c.includes('farm') || c.includes('basis')) return 'yield';
  return 'other';
}

/** A stable small hash of a slug, so plan phrasing varies by protocol and never by run. */
function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** What one transaction roughly costs in gas on a chain, in dollars (a stated planning figure). */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana' || c === 'sui') return 0.1;
  if (c === 'base' || c === 'arbitrum' || c === 'op mainnet' || c === 'optimism' || c === 'linea' || c === 'scroll' || c === 'mantle' || c === 'unichain') return 0.4;
  if (c === 'bsc' || c === 'binance' || c === 'polygon' || c === 'avalanche' || c === 'fantom' || c === 'sonic' || c === 'celo' || c === 'cronos') return 0.3;
  if (c === 'bitcoin') return 3;
  return 1.2;
}

/** A dollar figure as a reader would say it: whole dollars plain, cents kept only when they matter. */
function money(n: number): string {
  const r = round2(n);
  return `$${Number.isInteger(r) ? r.toLocaleString('en-US') : r.toFixed(2)}`;
}

/** Active minutes as a short duration: 55m, 2h 05m. */
function timeText(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, '0')}m`;
}

/** How much capital one farm position needs, from the protocol's own TVL tier. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 300;
  if (p.tvl_usd >= 250_000_000) return 200;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 100;
  return 60;
}

/** How long to hold, from the protocol's no-token age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 35;
  return 30;
}

/** One plan step before it becomes a board string: the action, its stated cost and time, and the numbers the totals sum. */
interface PlanStep {
  text: string;
  cost: string;
  time: string;
  fee: number;
  minutes: number;
}

/** A step as one board string: its action, then its cost and time, within the gate's 20..600 characters once trimmed. */
export function stepText(step: PlanStep): string {
  let s = `${step.text}. Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The family's core action: the position the whole plan is built around, in the protocol's own terms. */
function coreStep(p: SnapshotProtocol, fam: Family, capital: number, chain: string, gas: number): PlanStep {
  const name = p.name;
  const half = Math.round(capital / 2);
  const third = Math.round(capital / 3);
  const fifth = Math.round(capital / 5);
  const mk = (text: string, fee: number): PlanStep => ({ text, cost: `${money(capital)} of capital and about ${money(fee)} of fees and gas`, time: '15 minutes to set up', fee, minutes: 15 });
  switch (fam) {
    case 'vault':
      return mk(`Deposit ${money(capital)} of USDC into a ${name} vault on ${chain} — choose the vault whose curator, strategy and withdrawal terms are stated on its own page — and keep the vault shares in the farm wallet, unsold`, gas);
    case 'dex':
      return mk(`Swap about ${money(half)} of USDC into the base asset and back on ${name}'s deepest ${chain} market, then pool the remaining ${money(capital - half)} as two-sided liquidity in that same market, so the wallet earns both volume and LP history`, 2 * gas + capital * 0.003);
    case 'perps':
      return mk(`Deposit ${money(capital)} of USDC as margin on ${name} and open a delta-neutral pair — long and short the same notional on its most liquid ${chain} market — so the wallet books real volume without betting on direction`, 2 * gas + capital * 0.001);
    case 'lending':
      return mk(`Supply ${money(capital)} of USDC to ${name}'s main ${chain} market, then borrow about ${money(third)} of a second asset against it once and repay within the week, so the wallet appears on both sides of the book`, 2 * gas);
    case 'cdp':
      return mk(`Open a vault on ${name} on ${chain}: deposit ${money(capital)} of ETH or a liquid staking token as collateral at no more than half the liquidation threshold, and mint a modest amount of its stablecoin against it`, 2 * gas);
    case 'prediction':
      return mk(`Fund the farm wallet with ${money(capital)} and take one position on each side of ${name}'s two most liquid markets, no more than ${money(fifth)} a side, so the account trades without needing to be right`, gas + 2);
    case 'bridge':
      return mk(`Bridge ${money(capital)} of USDC from ${chain} to ${p.chains[1] ?? 'a second chain it serves'} through ${name}'s own route and leave the bridged funds working on the far side for the whole hold`, 3 + gas);
    case 'staking':
      return mk(`Stake ${money(capital)} of the chain's staking asset through ${name} on ${chain} and hold the receipt token unsold for the full hold — the receipt staying in the wallet is the whole proof of participation`, gas);
    case 'yield':
      return mk(`Deposit ${money(capital)} of USDC into ${name}'s main strategy on ${chain} and leave it compounding; if the strategy is leveraged or basis-based, keep it at the strategy's own default settings rather than raising the risk`, gas);
    case 'rwa':
      return mk(`Mint ${money(capital)} of ${name}'s yield-bearing asset on ${chain} with USDC, completing any holder checks its page requires first, and hold the asset untouched for the full hold`, gas + 1);
    case 'chain':
      return mk(`Bridge ${money(capital)} of USDC onto ${name} itself and become a regular there: pay gas in its native asset, swap on its main exchange and keep a small working balance on the chain for the whole hold`, 3 * gas);
    case 'exchange':
      return { text: `Open a ${name} account in your own name, complete its identity checks, deposit ${money(capital)} of USDC and make two ordinary spot trades a week apart, leaving the balance on the account between them`, cost: `${money(capital)} of capital and about ${money(1 + capital * 0.001)} of trading and deposit fees`, time: '25 minutes including the checks', fee: 1 + capital * 0.001, minutes: 25 };
    default: {
      const c = (p.category ?? '').toLowerCase();
      if (c.includes('insurance')) return mk(`Buy about ${money(capital)} of cover on a large, well-known protocol from ${name} on ${chain} and keep the policy running to expiry rather than cancelling early`, gas);
      if (c.includes('index')) return mk(`Buy ${money(capital)} of a ${name} index position on ${chain} and hold it through the whole hold without rebalancing by hand — rebalancing is the index's own job`, gas);
      if (c.includes('payment') || c.includes('card')) return mk(`Open a ${name} account, load it with ${money(capital)} and route three ordinary payments through it across the hold, so the account shows real spending rather than a single load`, 1);
      if (c.includes('otc')) return mk(`Register on ${name}, finish its onboarding checks and complete one small trade of about ${money(half)} so the account is a trading account with a settled history`, 2);
      if (c.includes('privacy')) return mk(`Deposit ${money(capital)} through ${name} on ${chain} in one ordinary-sized note, leave it for the hold, and withdraw to the same wallet — one clean cycle, fully documented in your farm log`, 2 * gas);
      if (c.includes('governance')) return mk(`Take the qualifying position ${name} rewards on ${chain} with ${money(capital)} and vote in at least one governance poll during the hold from the same wallet`, gas);
      if (c.includes('stablecoin')) return mk(`Wrap ${money(capital)} of the underlying stablecoin through ${name} on ${chain} and hold the wrapped asset in the farm wallet for the full hold`, gas);
      if (c.includes('btc')) return mk(`Deposit about ${money(capital)} of BTC value through ${name}'s own route on ${chain} and hold the issued position untouched for the full hold`, gas + 2);
      return mk(`Deposit ${money(capital)} of USDC into ${name} on ${chain} through its own app, in the product its front page leads with, and keep the position open for the full hold`, gas);
    }
  }
}

/** The family's second action, deepening the history the core action starts; null where a category has none. */
function secondStep(p: SnapshotProtocol, fam: Family, capital: number, chain: string, gas: number): PlanStep | null {
  const name = p.name;
  const third = Math.round(capital / 3);
  const fifth = Math.round(capital / 5);
  const mk = (text: string, fee: number, minutes = 12): PlanStep => ({ text, cost: `about ${money(fee)} of fees and gas`, time: `${minutes} minutes`, fee, minutes });
  switch (fam) {
    case 'vault':
      return mk(`Split a second tranche of about ${money(third)} into a different ${name} vault on ${chain} — a different curator or strategy — so the wallet shows breadth across vaults, not one lucky deposit`, gas);
    case 'dex':
      return mk(`Add a second, smaller LP position of about ${money(third)} in ${name}'s next-deepest ${chain} pool and leave both positions untouched between weekly visits`, 2 * gas + capital * 0.002);
    case 'perps':
      return mk(`Roll the hedge on ${name} once mid-hold: close both legs, check the funding the pair paid or earned, and reopen at the same size, so the account shows more than a single open-and-close`, 2 * gas + capital * 0.001);
    case 'lending':
      return mk(`Move the supply once to ${name}'s second market, or to a second asset in the same market, keeping the health factor above 2 for the whole hold so the history reads as careful, not reckless`, 2 * gas);
    case 'cdp':
      return mk(`Put part of the minted stablecoin to work inside ${name}'s own pages — a stability pool or savings rate, whichever it offers — and keep the rest liquid for a quick collateral top-up if prices fall`, gas);
    case 'prediction':
      return mk(`Settle one finished market on ${name} promptly and roll the proceeds into a fresh market, so the account shows a full trade-settle-retrade cycle rather than abandoned positions`, gas + 1);
    case 'bridge':
      return mk(`Near the end of the hold, bridge a smaller ${money(third)} back over a different ${name} route if one exists, so the wallet carries round-trip history, not a one-way transfer`, 3 + gas);
    case 'staking':
      return mk(`Allocate a second tranche of about ${money(third)} to a different validator or vault inside ${name}, so the wallet is not tied to a single operator's record`, gas);
    case 'yield':
      return mk(`Harvest whatever the position accrues once mid-hold and restake it in the same ${name} strategy, so the wallet shows a claim-and-compound cycle as well as a deposit`, gas);
    case 'rwa':
      return mk(`Make one small secondary purchase or redemption of about ${money(fifth)} mid-hold, so the wallet shows it can exit ${name} as well as enter it`, gas + 1);
    case 'chain':
      return mk(`Use two more of ${name}'s native apps during the hold — a second exchange or a lending market — so the wallet's activity spreads across the chain instead of parking in one contract`, 2 * gas);
    case 'exchange':
      return mk(`Use one more ${name} product the account offers — a simple earn balance or a card payment, if it has one — with about ${money(fifth)}, so the account reads as a customer, not a bare signup`, 1);
    default: {
      const c = (p.category ?? '').toLowerCase();
      if (c.includes('insurance')) return mk(`Renew or extend the ${name} cover once before expiry if the hold outlasts the first policy term, keeping cover continuous for the whole hold`, gas);
      if (c.includes('index')) return mk(`Add about ${money(fifth)} more to the ${name} index position mid-hold, on a down week if there is one, so the wallet shows a second deliberate purchase`, gas);
      if (c.includes('otc')) return mk(`Complete a second, smaller trade of about ${money(fifth)} on ${name} in the opposite direction later in the hold, so the account has two-sided history`, 2);
      if (c.includes('payment') || c.includes('card')) return mk(`Make one payment of a different kind through ${name} — a card spend if the first were transfers, or the reverse — so the account's usage is not one repeated action`, 1);
      return null;
    }
  }
}

/** A protocol's farm plan: the assembled steps (5–8 of them) and the totals their numbers sum to. */
export interface FarmPlan {
  steps: string[];
  capital_usd: number;
  fees_usd: number;
  active_minutes: number;
  hold_days: number;
}

export function farmPlan(p: SnapshotProtocol, age: number | null, watch = false): FarmPlan {
  const fam = familyOf(p.category);
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.max(3, Math.round(hold / 7));
  const pick = slugHash(p.slug);
  const steps: PlanStep[] = [];

  const setups = [
    `Create a fresh wallet for ${p.name} alone, back its seed phrase up offline, and label the wallet with the protocol's name and the start date so every later step is auditable`,
    `Set up one dedicated wallet for this farm — never your main wallet — fund it on ${chain} for ${p.name} and keep a written note of why this wallet exists and what it is allowed to hold`,
    `Start with a clean wallet whose only job is ${p.name}: generate it, store its seed phrase on paper, and send it a small test amount on ${chain} before committing the full position`,
  ];
  steps.push({ text: setups[pick % 3]!, cost: `about ${money(2 * gas)} of gas for the first test transactions on ${chain}`, time: '12 minutes', fee: 2 * gas, minutes: 12 });

  // A lean plan for a small, narrow, non-watchlist protocol: no separate funding step, so the
  // plan is the core five. Watchlist rows and larger or wider protocols keep the fuller plan.
  const lean = p.tvl_usd < 60_000_000 && p.chains.length <= 2 && !watch;
  if ((capital >= 150 || p.chains.length >= 3) && !lean) {
    const reserve = Math.max(5, Math.round(6 * gas));
    steps.push({
      text: `Move the position capital onto ${chain} — ${p.name}'s primary chain of the ${p.chains.length} it lists — ${secondChain !== null ? `bridging from ${secondChain} or buying directly on ${chain}` : `buying USDC on ${chain} directly`}, and keep about ${money(reserve)} aside in the chain's gas asset so later steps never stall for fees`,
      cost: `about ${money((secondChain !== null ? 4 : 0) + gas)} of bridge and gas fees`,
      time: '15 minutes',
      fee: (secondChain !== null ? 4 : 0) + gas,
      minutes: 15,
    });
  }

  steps.push(coreStep(p, fam, capital, chain, gas));
  const second = secondStep(p, fam, capital, chain, gas);
  // One single-chain plan in five keeps a single core action and leans on the weekly rhythm
  // instead: a focused plan, not a padded one.
  if (second !== null && !(pick % 5 === 4 && p.chains.length === 1)) steps.push(second);

  if (secondChain !== null) {
    const gas2 = gasFor(secondChain);
    steps.push({
      text: `${p.name} is live on ${p.chains.length} chains; repeat a light version of the core action on ${secondChain} with about ${money(Math.round(capital / 5))}, so the wallet's history is not confined to ${chain} alone`,
      cost: `about ${money(4 + gas2)} of bridge and gas fees on ${secondChain}`,
      time: '15 minutes',
      fee: 4 + gas2,
      minutes: 15,
    });
  }

  const volumeFam = fam === 'dex' || fam === 'perps' || fam === 'prediction' || fam === 'exchange';
  if (volumeFam) {
    const weeklyVol = Math.max(50, Math.round(capital / 2));
    const fee = round2(weeks * gas * 2 + weeks * weeklyVol * 0.002);
    steps.push({
      text: pick % 2 === 0
        ? `Trade a little every week on ${p.name} — about ${money(weeklyVol)} of volume in small clips, in at least ${weeks} separate weeks of the hold — so the account builds a volume history with a rhythm, not a single burst`
        : `Keep a weekly rhythm on ${p.name}: roughly ${money(weeklyVol)} of volume a week in small clips, spread over at least ${weeks} separate weeks, so the history reads as a regular user's and not a one-day spike`,
      cost: `about ${money(fee)} of gas and trading fees across the hold, building toward ${money(weeklyVol * weeks)} of cumulative volume`,
      time: `10 minutes a week for ${weeks} weeks`,
      fee,
      minutes: 10 * weeks,
    });
  } else {
    const actionByFamily: Record<string, string> = {
      vault: 'a small top-up or a rebalance between its vaults',
      lending: 'a supply top-up, a borrow or a repayment',
      cdp: 'a collateral check, a top-up or a small mint or repay',
      bridge: 'one more small bridge over any of its routes',
      staking: 'a small extra stake or a rewards claim',
      yield: 'a harvest, a claim or a small top-up',
      rwa: 'a small mint or a balance check-in trade',
      chain: 'a swap, a payment or any gas-paying action on the chain',
    };
    const action = actionByFamily[fam] ?? 'a deposit, a claim or a vote';
    const fee = round2(weeks * gas);
    steps.push({
      text: pick % 2 === 0
        ? `Return once a week for one qualifying action on ${p.name} — ${action} — in at least ${weeks} separate weeks of the hold, so the wallet reads as a regular, not a drive-by`
        : `Come back weekly for one qualifying action on ${p.name} — ${action} — spread over at least ${weeks} separate weeks, so the activity has a history and not a single burst`,
      cost: `about ${money(fee)} of gas across the hold`,
      time: `10 minutes a week for ${weeks} weeks`,
      fee,
      minutes: 10 * weeks,
    });
  }

  const ageClause = age !== null ? `${p.name} has run ${age} days with no token recorded, and a hold of this length is short against that history` : `the snapshot gives no listing date for ${p.name}, so the hold uses the board's default window`;
  steps.push({
    text: pick % 2 === 0
      ? `Hold the position for at least ${hold} days, never dropping below half the opening size, so the activity is live across several of the protocol's own weekly snapshots; ${ageClause}`
      : `Keep the ${p.name} position live for at least ${hold} days and never let it fall below half the opening size, so it is present in several of the protocol's own weekly snapshots; ${ageClause}`,
    cost: `the ${money(capital)} stays committed, plus its market and smart-contract risk`,
    time: `${hold} days`,
    fee: 0,
    minutes: 0,
  });

  if (pick % 3 !== 0 && (watch || age === null || age >= 300)) {
    steps.push({
      text: `Open ${p.name}'s own points, rewards or governance page — only from a link its official site publishes — connect this same wallet, and claim or vote wherever it offers; if it offers nothing yet, save a dated screenshot of the page into the farm log as evidence of checking`,
      cost: `about ${money(gas)} of gas if a claim is live; never pay a third party to claim for you`,
      time: '10 minutes',
      fee: gas,
      minutes: 10,
    });
  }

  // Keep the plan inside the gate's shape: at most 7 working steps plus the summary.
  while (steps.length > 7) {
    const claimAt = steps.findIndex((s) => s.text.startsWith('Open ') && s.text.includes('points, rewards or governance'));
    if (claimAt >= 0) steps.splice(claimAt, 1);
    else steps.splice(1, 1);
  }

  const fees = round2(steps.reduce((n, s) => n + s.fee, 0));
  const active = steps.reduce((n, s) => n + s.minutes, 0);
  steps.push({
    text: `Plan total for ${p.name}: commit ${money(capital)} of capital, expect about ${money(fees)} in gas, bridge and trading fees, and ${timeText(active)} of active work spread across the ${hold}-day hold; keep a farm log of the wallet, the dates and every transaction hash, and when the hold ends decide from that log whether to roll the capital into the next candidate on the board`,
    cost: `the ${money(capital)} position plus about ${money(fees)} of fees in total`,
    time: `${timeText(active)} of active work over a ${hold}-day hold`,
    fee: 0,
    minutes: 0,
  });

  return { steps: steps.map(stepText), capital_usd: capital, fees_usd: fees, active_minutes: active, hold_days: hold };
}

// ---------------------------------------------------------------- the board

/** Every pre-token launch candidate that passes the screen, ranked by implied value, strongest first, ranks 1..N. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = compMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isPreToken(p) && passesScreen(p));
  const scored = chosen.map((p) => {
    const comp = comps.forCategory(p.category);
    const v = impliedValues(p, snapshot.as_of, comp, model);
    const plan = farmPlan(p, v.age, watch.has(p.slug));
    return { p, comp, v, plan };
  });
  scored.sort((a, b) => b.v.base - a.v.base || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.v.age,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.v.base,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    radar_score: radarScore(s.p, s.v.age),
    model: {
      multiple: s.comp.multiple,
      multiple_low: s.comp.multiple_low,
      multiple_high: s.comp.multiple_high,
      comps: s.comp.comps,
      growth_multiplier: s.v.growthMult,
      maturity_multiplier: s.v.maturityMult,
      breadth_multiplier: s.v.breadthMult,
    },
    farm_capital_usd: s.plan.capital_usd,
    farm_fees_usd: s.plan.fees_usd,
    farm_active_minutes: s.plan.active_minutes,
    farm_hold_days: s.plan.hold_days,
    farm_steps: s.plan.steps,
  }));
}

/** The live-token protocols, by market cap: the comps set, never ranked, shown at the market's own values. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      mcap_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** A board row's form for data.js: the raw figures, so the page recomputes the value itself. */
export function radarRow(row: BoardRow, model: ModelConstants = MODEL): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    watchlist: row.watchlist,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    radar_score: row.radar_score,
    drop_pool_usd: Math.round(row.implied_value_usd * model.community_share),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = compMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const setAside = setAsideRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_multiple: comps.global,
    comps: comps.table,
    scanned: snapshot.protocols.length,
    pre_token: snapshot.protocols.filter(isPreToken).length,
    board_size: board.length,
    watchlist_size: snapshot.watchlist.length,
    early_size: board.filter((r) => !r.watchlist).length,
    set_aside_size: setAside.length,
    live_size: live.length,
    live_total: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    rows: board.map((r) => radarRow(r, model)),
    set_aside: setAside,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: size, slugs, coverage, ranks, order, values, ranges, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    if (seen.has(r.slug)) return `${r.slug} appears twice`;
    seen.add(r.slug);
    if (r.name.length === 0) return `${r.slug} has an empty name`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.implied_low_usd > r.implied_value_usd || r.implied_high_usd < r.implied_value_usd) return `${r.slug} has a range that excludes its own implied value`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
  }
  const candidates = snapshot.protocols.filter((p) => isPreToken(p) && passesScreen(p));
  if (board.length !== candidates.length) return `the board ranks ${board.length} of the snapshot's ${candidates.length} pre-token launch candidates (the rest are set aside as products of tokens that already trade)`;
  for (const r of board) {
    const p = snapshot.protocols.find((q) => q.slug === r.slug);
    if (p !== undefined && !passesScreen(p)) return `${r.slug} is ranked but the screen sets it aside: ${setAsideReason(p)}`;
  }
  const missing = snapshot.watchlist.filter((s) => !seen.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  const byRank = [...board].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < byRank.length; i++) if (byRank[i]!.implied_value_usd > byRank[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && byRank[0]!.implied_value_usd === byRank[byRank.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
