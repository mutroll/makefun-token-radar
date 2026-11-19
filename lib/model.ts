// Launch Radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// The board ranks protocols that record no token yet by the value their launch would carry if the
// protocol's record stayed as it is. Every figure comes from the snapshot itself: nothing is fetched,
// no protocol name is special-cased, and the same functions score every row.
//
// Who is ranked. A protocol is pre-token when its record carries no token at all (no market cap, no
// CoinGecko id, no symbol). A pre-token protocol is rankable when it is not a wrapped, staked or
// bridged product of a token that already trades, judged by the snapshot's own fields with the
// watchlist's rule: its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC or CEX, its name ends in no version marker and carries no whole word wrapped, staked or
// staking, and it does not begin with an exchange's name. Every watchlist slug is ranked whatever the
// screen says (the watchlist is the floor the gate checks), and every other rankable pre-token
// protocol is ranked too, at any TVL: the early rows are the ones below the floor.
//
// What a launch would be worth. Protocols whose token already trades price their TVL every day, so
// the model borrows that price instead of inventing one:
//
//   multiple(category) = the median market-cap/TVL of the snapshot's live-token protocols in the
//                        category, shrunk toward the global median by the comp count
//                        (n x median + 8 x global) / (n + 8), clamped to [0.08, 1.50]; a category
//                        with no live comps uses the global median.
//   growthMult         = 1 + clamp(change_7d, -50, 100) / 100 x 0.45   (unreported growth: neutral)
//   maturityMult       = 0.78 + 0.44 x min(age_days, 1460) / 1460      (age unreported: 0.95)
//   breadthMult        = 1 + 0.025 x min(chains - 1, 8)
//   implied_value_usd  = max(1, round(tvl_usd x multiple x growthMult x maturityMult x breadthMult))
//
// The factors are rounded to 4 decimals before the multiplication, so the dashboard's own copy of
// this arithmetic (dashboard/app.js) lands on the same dollar the board carries.
//
// The farm plan is generated per protocol from its category, its first chain, its TVL tier and its
// age, in six steps that each name an action, what it costs and how long it takes. The page carries
// the same generator, so the plan a reader opens is the plan board.json holds.

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
export const MODEL_VERSION = 'launch-radar-2';

/** How many live-token protocols the dashboard's comps view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's comp evidence: how many live protocols price it, their median, the multiple used. */
export interface CompRow {
  category: string;
  comps: number;
  median: number | null;
  multiple: number;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
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
  radar_score: number;
  model: {
    multiple: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
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
  radar_score: number;
  drop_pool_usd: number;
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
  live_size: number;
  rows: RadarRow[];
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
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names a product may begin with (the watchlist's rule). */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The watchlist's screen, from the snapshot's own fields: not a product of a token that trades. */
export function passesScreen(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * The category multiples, priced by the snapshot's own live-token protocols: for each category, the
 * median market-cap/TVL of its live protocols, shrunk toward the global median and clamped. The
 * global row comes first, then the board's categories in name order.
 */
export function compMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { global: number; table: CompRow[]; forCategory: (category: string | null) => number } {
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
  const globalRaw = all.length > 0 ? median(all) : 0.2;
  const global = round4(clamp(globalRaw, model.multiple_floor, model.multiple_cap));
  const used = (category: string | null): number => {
    const list = ratiosByCategory.get(category ?? 'Uncategorized');
    if (list === undefined || list.length === 0) return global;
    const shrunk = (list.length * median(list) + model.shrink_k * globalRaw) / (list.length + model.shrink_k);
    return round4(clamp(shrunk, model.multiple_floor, model.multiple_cap));
  };
  const watch = new Set(snapshot.watchlist);
  const boardCategories = new Set<string>();
  for (const p of snapshot.protocols) {
    if (isPreToken(p) && (watch.has(p.slug) || passesScreen(p))) boardCategories.add(p.category ?? 'Uncategorized');
  }
  const table: CompRow[] = [{ category: 'All categories (global)', comps: all.length, median: round4(globalRaw), multiple: global }];
  for (const category of [...boardCategories].sort()) {
    const list = ratiosByCategory.get(category);
    table.push({
      category,
      comps: list === undefined ? 0 : list.length,
      median: list === undefined || list.length === 0 ? null : round4(median(list)),
      multiple: used(category),
    });
  }
  return { global, table, forCategory: used };
}

/** The model's four factors for one protocol, each rounded as the dashboard rounds them. */
export function modelFactors(
  p: SnapshotProtocol,
  asOf: string,
  multiple: number,
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

/** The implied launch value of one protocol, in whole dollars. */
export function impliedValue(p: SnapshotProtocol, asOf: string, multiple: number, model: ModelConstants = MODEL): number {
  const { growthMult, maturityMult, breadthMult } = modelFactors(p, asOf, multiple, model);
  return Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
}

/**
 * A 1..99 radar score for display only (the ranking is by implied value): half the protocol's size on
 * a log scale, a quarter its 7-day growth, a quarter how long it has run with no token.
 */
export function radarScore(p: SnapshotProtocol, age: number | null): number {
  const size = clamp((Math.log10(Math.max(p.tvl_usd, 1)) - Math.log10(5_000_000)) / (Math.log10(3_000_000_000) - Math.log10(5_000_000)), 0, 1);
  const growth = (clamp(p.change_7d ?? 0, -50, 100) + 50) / 150;
  const seasoned = Math.min(age ?? 365, 1460) / 1460;
  return clamp(Math.round(100 * (0.5 * size + 0.25 * growth + 0.25 * seasoned)), 1, 99);
}

// ---------------------------------------------------------------- farm plans

/** A stable small hash of a slug, so plan phrasing varies by protocol and never by run. */
function slugHash(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction roughly costs in gas on a chain, in dollars (a stated planning figure). */
function gasFor(chain: string): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return 12;
  if (c === 'solana') return 0.1;
  if (c === 'base' || c === 'arbitrum' || c === 'op mainnet' || c === 'optimism') return 0.5;
  if (c === 'bsc' || c === 'binance' || c === 'polygon' || c === 'avalanche' || c === 'fantom') return 0.3;
  return 1.5;
}

const gasText = (g: number): string => (g < 1 ? 'under $1' : `about $${g}`);

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 25_000_000) return 100;
  return 60;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's core action, in words a farmer can follow. */
function coreAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('dex')) return `Swap about $${Math.round(capital / 2)} of USDC for ETH and back on ${name}'s main market on ${chain}, then provide the rest as liquidity in its deepest USDC pool`;
  if (c.includes('lending') || c.includes('uncollateralized') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain}, then borrow about $${Math.round(capital / 3)} against it once so both sides of the market see the wallet`;
  if (c.includes('cdp')) return `Deposit $${capital} of ETH or a liquid staking token as collateral on ${name} on ${chain} and mint a modest amount of its stablecoin against it`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('interest rate')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, long and short the same size, so the wallet books volume without directional risk`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('liquidity manager')) return `Deposit $${capital} of USDC into a ${name} vault on ${chain} run by a named curator, and keep the vault shares in the wallet`;
  if (c.includes('rwa')) return `Mint $${capital} of ${name}'s yield-bearing asset on ${chain} with USDC and hold the asset in the wallet`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis-trading vault on ${chain} and keep the position through a full funding cycle`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of ETH or its liquid staking token through ${name} on ${chain} and keep the receipt token unsold`;
  if (c === 'chain') return `Bridge $${capital} of USDC to ${name} itself, then make the wallet a regular on the chain: pay gas, swap on its main exchange and hold a small balance there`;
  if (c.includes('prediction')) return `Fund the wallet with $${capital} and take one position on each side of two liquid markets on ${name}, sized under $${Math.round(capital / 5)} a side`;
  if (c.includes('insurance')) return `Buy $${capital} of cover on a large protocol from ${name} on ${chain} and keep the policy to expiry`;
  if (c.includes('payment') || c.includes('card')) return `Open a ${name} account, load it with $${capital} and route two ordinary payments through it so the wallet shows real usage`;
  if (c.includes('stablecoin')) return `Mint or deposit $${capital} of the stable asset ${name} issues on ${chain} and hold it in the wallet`;
  if (c.includes('index')) return `Buy $${capital} of a ${name} index position on ${chain} and hold it rather than trading in and out`;
  if (c.includes('otc')) return `Register on ${name}, complete its checks and make one small trade of about $${Math.round(capital / 2)} so the account is a trading account`;
  if (c.includes('yield') || c.includes('farm') || c.includes('leveraged')) return `Deposit $${capital} of USDC into ${name}'s main vault on ${chain} and leave the position compounding`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} through its own app and keep the position open`;
}

/** Whether the category earns by trading volume (its weekly step names a volume target). */
function isVolumeCategory(p: SnapshotProtocol): boolean {
  const c = (p.category ?? '').toLowerCase();
  return c.includes('dex') || c.includes('derivative') || c.includes('perpetual') || c.includes('prediction') || c.includes('otc');
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters once trimmed. */
export function stepText(step: FarmStep): string {
  let s = `${step.text}. Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, derived from the
 * protocol's own record (category, first chain, TVL tier, age) and its slug's hash for phrasing.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const gas = gasFor(chain);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const pick = slugHash(p.slug);
  const weekly =
    pick % 2 === 0
      ? `Repeat one qualifying action every week - a deposit, a swap, a borrow or a vote - in at least three separate weeks of the hold, so the wallet reads as a regular, not a drive-by`
      : `Come back once a week for one qualifying action - a top-up, a swap, a borrow or a vote - spread over at least three separate weeks, so the activity has a history and not a single burst`;
  const weeklyCost = isVolumeCategory(p)
    ? `about $${Math.max(2, Math.round(gas * 2))} of gas a week, building toward $${(capital * 20).toLocaleString('en-US')} of cumulative volume over the hold`
    : `about $${Math.max(1, Math.round(gas))} of gas a week`;
  return [
    {
      text: `Set up a fresh wallet for ${p.name} alone, fund it on ${chain} with the position capital plus gas money, and keep its seed phrase offline`,
      cost: `under $${Math.max(2, Math.round(gas))} for the first transactions`,
      time: '10 minutes',
    },
    {
      text: coreAction(p, capital, chain),
      cost: `$${capital} of capital and ${gasText(gas)} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: weekly,
      cost: weeklyCost,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days without withdrawing below half the deposit, so the activity is live in more than one weekly snapshot of the protocol`,
      cost: `the $${capital} stays in the position, plus its market risk`,
      time: `${hold} days`,
    },
    {
      text: `Open ${p.name}'s own points, rewards or governance page from the link its official site publishes, connect the same wallet, and claim or vote wherever the page offers it`,
      cost: 'nothing to check; never pay a third party to claim',
      time: '10 minutes',
    },
    {
      text: `Keep a farm log of the wallet, the dates and every transaction hash, and review it monthly: if no launch signal has come in two quarters, unwind the position and move the capital to the next row of the board`,
      cost: 'nothing but the log',
      time: '5 minutes a month',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const comps = compMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = snapshot.protocols.filter((p) => isPreToken(p) && (watch.has(p.slug) || passesScreen(p)));
  const scored = chosen.map((p) => {
    const multiple = comps.forCategory(p.category);
    const { growthMult, maturityMult, breadthMult, age } = modelFactors(p, snapshot.as_of, multiple, model);
    const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growthMult * maturityMult * breadthMult));
    return { p, multiple, growthMult, maturityMult, breadthMult, age, implied };
  });
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    listed_at: s.p.listed_at,
    age_days: s.age,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    implied_value_usd: s.implied,
    radar_score: radarScore(s.p, s.age),
    model: {
      multiple: s.multiple,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      breadth_multiplier: s.breadthMult,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's comps view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
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
    radar_score: row.radar_score,
    drop_pool_usd: Math.round(row.implied_value_usd * model.community_share),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = compMultiples(snapshot, model);
  const live = liveRows(snapshot);
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
    live_size: live.length,
    rows: board.map((r) => radarRow(r, model)),
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

/** Why a board is not one the gate will take, or null: size, slugs, coverage, ranks, order, values, farm steps. */
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
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters once trimmed`;
    }
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
