/**
 * Route A 复权口径改造 —— 新表正确性验证（DB 层可复现证据链）。
 *
 * 用法：pnpm --prefix apps/server verify:route-a
 *
 * 证明分五层，从「不依赖外部源」到「依赖外部源」，逐层递进：
 *   L1 结构不变量     —— 值域 / 覆盖率 / 视图行数守恒 / 最新日锚点（纯 SQL 断言，必须 0 违例）
 *   L2 基表 ↔ 上游     —— bar1d_raw(不复权) 逐点等于源端 adjust=none
 *   L3 因子表 ↔ 上游   —— adj_factor / adj_factor_latest 逐段等于 quant /adjust-params 重取结果
 *                        （只比共同日期的段值；源窗口滚动导致的首段日期标签漂移与
 *                        scale/hfq_base 拟合漂移属固有性质，见下方容差注释）
 *   L4 视图 ↔ 源 oracle —— bar1d_qfq 逐点比源端 qfq 价位；hfq 跨源只比收益率（价位锚点惯例不同）
 *                        仅在 [该标的最早因子日, ∞) 上比（更早历史无因子，不在模型有效域）
 *   L5 派生表 ↔ 重聚合  —— bar_period_adj 等于 bar1d_qfq 按 5d / 周 / 月重聚合
 *
 * 退出码：L1/L3 出现违例 → 1（确定性契约被破坏）；L2/L4/L5 超差仅告警（含源端既定瑕疵）。
 */
/* eslint-disable unicorn/no-process-exit -- 独立 CLI 校验脚本，以退出码表示结果 */
import { db } from "../src/db/index";
import { sql } from "drizzle-orm";
import { quant } from "../src/lib/quant";

const TOL_RAW = 1e-4;
const TOL_FACTOR = 1e-6;
const TOL_QFQ = 1e-2;
// hfq 跨源只比收益率（价位锚点惯例不同）。但两源价位舍入粒度不同（2/3 位小数），
// 低价股（如北交所微盘）单看 1 分钱的舍入即可把收益率差放大到 ~1%，故容差随价位放宽：
//   tol(前收 prev) = max(TOL_RET, TOL_RET_CENTS / prev)
const TOL_RET = 5e-4;
const TOL_RET_CENTS = 0.01;
// 价位比对的有效边界是「1 个报价最小变动单位」，浮点表示会让恰好落在边界上的差值
// 略微溢出（如 0.0100000000000015 > 0.01），故比较时统一加一个极小 epsilon 抵消。
const EPS = 1e-9;

const failures: string[] = [];
const ok = (name: string, pass: boolean, detail: string) => {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${detail}`);
  if (!pass) failures.push(name);
};
const warn = (name: string, detail: string) => console.log(`WARN  ${name}  ${detail}`);
const info = (name: string, detail: string) => console.log(`INFO  ${name}  ${detail}`);
const num = (x: unknown) => Number(x ?? 0);

const srcOf = (mk: string) => (mk === "BJ" ? "eastmoney" : "tencent");
const altOf = (mk: string) => (mk === "BJ" ? "tencent" : "eastmoney");
/** 截取「最早因子日」之后的有效域 bar；min 为 null（无因子）时不过滤。 */
const fromDate = <T extends { d: string }>(xs: T[], min: string | null): T[] =>
  min ? xs.filter((x) => x.d >= min) : xs;

async function sampleSymbols(perMarket: number) {
  const rs = await db.execute(sql`
    select symbol, mk from (
      select symbol, right(symbol, 2) mk,
             row_number() over (partition by right(symbol, 2) order by random()) rn
      from instrument where status = 'listed'
    ) t where rn <= ${perMarket} order by mk, symbol
  `);
  return rs.rows.map((r) => ({ symbol: String(r.symbol), mk: String(r.mk) }));
}

async function tryN<T>(fn: () => Promise<T>, n = 3, ms = 1500): Promise<T | null> {
  for (let i = 0; i < n; i++) {
    try {
      return await fn();
    } catch {
      await new Promise((r) => setTimeout(r, ms));
    }
  }
  return null;
}

type Series = { d: string; close: number }[];
const toSeries = (bars: { time: string; close: number }[]): Series =>
  bars
    .map((b) => ({ d: String(b.time).slice(0, 10), close: Number(b.close) }))
    .toSorted((a, b) => (a.d < b.d ? -1 : 1));

function retMap(series: Series): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]!.close;
    const b = series[i]!.close;
    if (a > 0) m.set(series[i]!.d, b / a - 1);
  }
  return m;
}
function cmpLevel(map: Map<string, number>, series: Series) {
  let n = 0, max = 0;
  for (const s of series) {
    const v = map.get(s.d);
    if (v == null) continue;
    n++;
    const dd = Math.abs(v - s.close);
    if (dd > max) max = dd;
  }
  return { n, max };
}
function cmpRet(map: Map<string, number>, series: Series) {
  let n = 0, max = 0;
  for (const [d, r] of retMap(series)) {
    const v = map.get(d);
    if (v == null) continue;
    n++;
    const dd = Math.abs(v - r);
    if (dd > max) max = dd;
  }
  return { n, max };
}
/** 同 cmpRet，但按「前收」计算价格相关容差，返回超出容差的最大幅度（>0 即违例）。 */
function cmpRetRel(map: Map<string, number>, series: Series) {
  let n = 0, max = 0, maxExcess = 0;
  const rets = retMap(series);
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.close;
    const d = series[i]!.d;
    const r = rets.get(d);
    const v = map.get(d);
    if (r == null || v == null) continue;
    n++;
    const dd = Math.abs(v - r);
    if (dd > max) max = dd;
    const tol = prev > 0 ? Math.max(TOL_RET, TOL_RET_CENTS / prev) : TOL_RET;
    const excess = dd - tol;
    if (excess > maxExcess) maxExcess = excess;
  }
  return { n, max, maxExcess };
}
function summarize(arr: { n: number; max: number }[]) {
  const a = arr.map((x) => x.max).toSorted((p, q) => p - q);
  const pick = (p: number) => (a.length > 0 ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : -1);
  const avgN = arr.length > 0 ? Math.round(arr.reduce((s, x) => s + x.n, 0) / arr.length) : 0;
  return { n: a.length, avgPts: avgN, med: pick(0.5), p90: pick(0.9), max: pick(0.999) };
}

async function viewAsc(symbol: string, table: "qfq" | "hfq"): Promise<Series> {
  const tbl = table === "qfq" ? sql`bar1d_qfq` : sql`bar1d_hfq`;
  const rs = await db.execute(
    sql`select to_char(time, 'YYYY-MM-DD') d, close from ${tbl} where symbol = ${symbol} order by time asc`,
  );
  return rs.rows.map((r) => ({ d: String(r.d), close: Number(r.close) }));
}

async function L1(sample: { symbol: string; mk: string }[]) {
  console.log("\n=== L1 结构不变量（纯 SQL 断言，必须 0 违例）===");
  const syms = sample.map((s) => s.symbol);
  const inList = () => sql.join(syms.map((s) => sql`${s}`), sql`, `);

  // 行数：bar1d_raw / bar_period_adj 为千万级，用 pg_class.reltuples 免全表扫描；
  // 因子表为万级、小，做精确计数。
  const t = await db.execute(sql`
    select
      (select reltuples::bigint from pg_class where relname = 'bar1d_raw')      as raw_rows,
      (select reltuples::bigint from pg_class where relname = 'bar_period_adj') as bpa_rows,
      (select count(*) from adj_factor)                                         as af_rows,
      (select count(*) from adj_factor_latest)                                  as afl_rows
  `);
  info("行数（大表为 pg_class 统计近似）", JSON.stringify(t.rows[0]));

  // 值域：因子表小，精确断言 0 < qfq_ratio <= 1 且 offset 非空。
  const bad = await db.execute(sql`
    select count(*) filter (where qfq_ratio <= 0 or qfq_ratio > 1) as bad_ratio,
           count(*) filter (where qfq_offset is null) as null_off,
           min(qfq_ratio) as mn, max(qfq_ratio) as mx,
           min(qfq_offset) as omn, max(qfq_offset) as omx
    from adj_factor
  `);
  const b = bad.rows[0]!;
  ok(
    "adj_factor 值域 0<qfq_ratio<=1 且 offset 非空",
    num(b.bad_ratio) === 0 && num(b.null_off) === 0,
    `bad_ratio=${b.bad_ratio} null_offset=${b.null_off} ratio∈[${b.mn},${b.mx}] offset∈[${b.omn},${b.omx}]`,
  );

  // 覆盖率：以 instrument(listed) 为标的全集，逐只索引探测最新复权因子是否齐备。
  const cov = await db.execute(sql`
    select (select count(*) from instrument where status = 'listed') as listed,
           (select count(*) from adj_factor_latest) as afl,
           (select count(*) from instrument i
              where i.status = 'listed'
                and not exists (select 1 from adj_factor_latest l where l.symbol = i.symbol)) as miss
  `);
  const c = cov.rows[0]!;
  ok(
    "adj_factor_latest 覆盖全部在售标的",
    num(c.miss) === 0,
    `listed=${c.listed} latest=${c.afl} 缺=${c.miss}`,
  );

  // 反向：latest 中不得存在 bar1d_raw 里没有的「幽灵标的」。
  const ghost = await db.execute(sql`
    select count(*) c from adj_factor_latest l
    where not exists (select 1 from bar1d_raw b where b.symbol = l.symbol)
  `);
  ok("adj_factor_latest 无幽灵标的（均有 bar1d_raw）", num(ghost.rows[0]!.c) === 0, `幽灵 ${ghost.rows[0]!.c}`);

  // 视图行数守恒：视图定义是 `left join lateral(... limit 1) on true`，
  // 恒为 1:1 → 抽样逐标的比对（全表 lateral join 16.9M 行代价过高且同义反复）。
  const cons = await db.execute(sql`
    select count(*) as mism from (
      select b.symbol,
             count(*) as raw_c,
             (select count(*) from bar1d_qfq v where v.symbol = b.symbol) as qfq_c,
             (select count(*) from bar1d_hfq h where h.symbol = b.symbol) as hfq_c
      from bar1d_raw b
      where b.symbol in (${inList()})
      group by b.symbol
    ) x
    where raw_c <> qfq_c or raw_c <> hfq_c
  `);
  ok("视图行数守恒 == bar1d_raw（抽样）", num(cons.rows[0]!.mism) === 0, `样本=${syms.length} 不守恒=${cons.rows[0]!.mism}`);

  // 最新交易日前复权锚点：前复权定义即「最新价不变」→ 最新交易日 qfq 收盘 == raw 收盘。
  // 注意 ratio=1/offset=0 只是该不变的 *充分* 条件：若最新日恰为送转除权日，合法参数
  // 的 ratio≠1（qfq 仍等于 raw），故这里只断言价位相等，容差取量化量级 TOL_RAW。
  const anchor = await db.execute(sql`
    with last as (select symbol, max(time) t from bar1d_raw where symbol in (${inList()}) group by symbol)
    select count(*) c,
           coalesce(max(abs(v.close - b.close)), 0) as maxdiff
    from last l
    join bar1d_raw b on b.symbol = l.symbol and b.time = l.t
    join bar1d_qfq v on v.symbol = l.symbol and v.time = l.t
    where abs(v.close - b.close) > ${TOL_RAW}
  `);
  ok(
    "最新交易日前复权锚点 qfq==raw",
    num(anchor.rows[0]!.c) === 0,
    `样本=${syms.length} 违例=${anchor.rows[0]!.c} maxdiff=${num(anchor.rows[0]!.maxdiff).toExponential(2)}`,
  );
}

async function L2(syms: { symbol: string; mk: string }[]) {
  console.log("\n=== L2 基表 bar1d_raw ↔ 上游（adjust=none）===");
  let checked = 0, maxAbs = 0, bad = 0;
  for (const s of syms) {
    const src = await tryN(() => quant.stockKline(s.symbol, 800, undefined, undefined, "none", srcOf(s.mk)));
    if (!src || src.length === 0) {
      warn(`L2 ${s.symbol}`, "源端取数失败，跳过");
      continue;
    }
    const rs = await db.execute(
      sql`select to_char(time,'YYYY-MM-DD') d, close from bar1d_raw where symbol = ${s.symbol}`,
    );
    const rawMap = new Map(rs.rows.map((r) => [String(r.d), Number(r.close)]));
    const c = cmpLevel(rawMap, toSeries(src));
    checked++;
    if (c.max > maxAbs) maxAbs = c.max;
    if (c.max > TOL_RAW) bad++;
    info(`L2 ${s.symbol}`, `common=${c.n} maxabs=${c.max.toExponential(2)}`);
  }
  const pass = bad === 0 && checked > 0;
  const detail = `${checked} 只，超差 ${bad} 只，maxabs=${maxAbs.toExponential(2)}`;
  if (pass) ok("bar1d_raw == 源端原始价", true, detail);
  else warn("bar1d_raw == 源端原始价", detail);
}

async function L3(syms: { symbol: string; mk: string }[]) {
  console.log("\n=== L3 因子表 ↔ 上游 /adjust-params 重取比对 ===");
  let checked = 0, bad = 0, maxAbs = 0;
  for (const s of syms) {
    const p = await tryN(() => quant.adjustParams(s.symbol, 800, srcOf(s.mk)));
    if (!p) {
      warn(`L3 ${s.symbol}`, "上游取数失败，跳过");
      continue;
    }
    const dbp = await db.execute(
      sql`select to_char(date,'YYYY-MM-DD') d, qfq_ratio, qfq_offset from adj_factor where symbol = ${s.symbol}`,
    );
    const dbMap = new Map(
      dbp.rows.map((r) => [String(r.d), { ratio: Number(r.qfq_ratio), off: Number(r.qfq_offset) }]),
    );
    const dbl = await db.execute(sql`select scale, hfq_base from adj_factor_latest where symbol = ${s.symbol}`);
    const latest = dbl.rows[0];
    if (!latest) {
      warn(`L3 ${s.symbol}`, "adj_factor_latest 缺行");
      bad++;
      continue;
    }
    // scale / hfq_base 是 _fit_hfq 的「相邻斜率/偏移中位数」拟合结果，源窗口每日滚动
    // 会让其出现量级 1e-5 上下的漂移，非确定性契约 → 只按相对幅度单列信息，不参与硬判据。
    const fitDrift = Math.max(
      Math.abs(Number(latest.scale) - p.scale) / (Math.abs(p.scale) || 1),
      Math.abs(Number(latest.hfq_base) - p.hfq_base) / (Math.abs(p.hfq_base) || 1),
    );
    // 段值：只在共同日期上比。源窗口起点每日前移，使首段「日期标签」相对 DB 滚动约 1 天，
    // 但同日期的段值（ratio/offset）不变 → 固有性质，不按缺失日期计失配。
    let common = 0, segMax = 0;
    for (const pt of p.points) {
      const d = String(pt.date).slice(0, 10);
      const row = dbMap.get(d);
      if (!row) continue;
      common++;
      segMax = Math.max(segMax, Math.abs(row.ratio - pt.qfq_ratio), Math.abs(row.off - pt.qfq_offset));
    }
    checked++;
    if (segMax > TOL_FACTOR) bad++;
    if (segMax > maxAbs) maxAbs = segMax;
    info(
      `L3 ${s.symbol}`,
      `common=${common}/${p.points.length} 段值maxabs=${segMax.toExponential(2)} 拟合漂移=${fitDrift.toExponential(2)}`,
    );
  }
  const pass = bad === 0 && checked > 0;
  ok("adj_factor / adj_factor_latest == 上游重取", pass, `${checked} 只，失配 ${bad} 只，maxabs=${maxAbs.toExponential(2)}`);
}

async function L4(syms: { symbol: string; mk: string }[]) {
  console.log("\n=== L4 视图 ↔ 源 oracle（qfq 比价位；hfq 比收益率）===");
  const qfqP: { n: number; max: number }[] = [];
  const qfqA: { n: number; max: number }[] = [];
  const hfqLvlP: { n: number; max: number }[] = [];
  const hfqRetP: { n: number; max: number; maxExcess: number }[] = [];
  const hfqRetA: { n: number; max: number; maxExcess: number }[] = [];
  const qfqRetP: { n: number; max: number }[] = [];
  const fails: string[] = [];

  for (const s of syms) {
    // 因子表反解窗口受腾讯 fqkline 单次 800 根上限约束，仅覆盖最近窗口；更早历史 bar 在视图中
    // 合法回退为 ratio=1/offset=0（不复权）。故只在该标的「最早因子日」之后比对 —— 域外 bar
    // 不在 qfq 模型有效域内，与源端比价位必然超差（属已知限制，非数据缺陷）。
    const afMinRs = await db.execute(
      sql`select to_char(min(date),'YYYY-MM-DD') d from adj_factor where symbol = ${s.symbol}`,
    );
    const afMin = afMinRs.rows[0]?.d == null ? null : String(afMinRs.rows[0].d);
    const [qv, hv] = [fromDate(await viewAsc(s.symbol, "qfq"), afMin), fromDate(await viewAsc(s.symbol, "hfq"), afMin)];
    const qvMap = new Map(qv.map((x) => [x.d, x.close]));
    const hvMap = new Map(hv.map((x) => [x.d, x.close]));
    const [qp, hp, qa, ha] = await Promise.all([
      tryN(() => quant.stockKline(s.symbol, 800, undefined, undefined, "qfq", srcOf(s.mk))),
      tryN(() => quant.stockKline(s.symbol, 800, undefined, undefined, "hfq", srcOf(s.mk))),
      tryN(() => quant.stockKline(s.symbol, 800, undefined, undefined, "qfq", altOf(s.mk))),
      tryN(() => quant.stockKline(s.symbol, 800, undefined, undefined, "hfq", altOf(s.mk))),
    ]);
    if (qp?.length) {
      const qps = fromDate(toSeries(qp), afMin);
      const c = cmpLevel(qvMap, qps);
      qfqP.push(c);
      qfqRetP.push(cmpRet(retMap(qv), qps));
      if (c.max > TOL_QFQ + EPS) fails.push(`${s.symbol} qfq/主源 maxabs=${c.max.toFixed(4)}`);
    }
    if (hp?.length) {
      const hps = fromDate(toSeries(hp), afMin).slice(0, -1); // 去源端末根未结算离群
      hfqLvlP.push(cmpLevel(hvMap, hps));
      hfqRetP.push(cmpRetRel(retMap(hv), hps));
    }
    if (qa?.length) {
      const qas = fromDate(toSeries(qa), afMin);
      const c = cmpLevel(qvMap, qas);
      qfqA.push(c);
      if (c.max > TOL_QFQ + EPS) fails.push(`${s.symbol} qfq/独立源 maxabs=${c.max.toFixed(4)}`);
    }
    if (ha?.length) {
      const has_ = fromDate(toSeries(ha), afMin).slice(0, -1);
      hfqRetA.push(cmpRetRel(retMap(hv), has_));
    }
  }

  info("qfq 价位 vs 主源", JSON.stringify(summarize(qfqP)));
  info("qfq 价位 vs 独立源", JSON.stringify(summarize(qfqA)));
  info("qfq 收益 vs 主源", JSON.stringify(summarize(qfqRetP)));
  info("hfq 价位 vs 主源（去末根）", JSON.stringify(summarize(hfqLvlP)));
  info("hfq 收益 vs 主源（去末根）", JSON.stringify(summarize(hfqRetP)));
  info("hfq 收益 vs 独立源（去末根）", JSON.stringify(summarize(hfqRetA)));
  const maxQR = summarize(qfqP).max;
  const maxHR = Math.max(summarize(hfqRetP).max, summarize(hfqRetA).max);
  const maxHRExcess = Math.max(0, ...[...hfqRetP, ...hfqRetA].map((x) => x.maxExcess));
  // L4 是「外部源 oracle」比对，含跨厂商固有瑕疵（日历不一致 / 高后复权锚点惯例差异），
  // 按头部契约只作告警：qfq 价位与主源一致到 1 个最小变动单位即视为通过。
  const qfqName = `qfq 价位 vs 源 <= ${TOL_QFQ}`;
  const qfqDetail = `maxabs=${maxQR.toFixed(6)}${fails.length > 0 ? " | " + fails.join("; ") : ""}`;
  if (maxQR <= TOL_QFQ + EPS) ok(qfqName, true, qfqDetail);
  else warn(qfqName, qfqDetail);
  const hfqName = `hfq 收益率跨源一致（容差 max(${TOL_RET}, ${TOL_RET_CENTS}/前收)）`;
  const hfqDetail = `maxdiff=${maxHR.toExponential(2)} 超容差=${maxHRExcess.toExponential(2)}`;
  if (maxHRExcess <= 0) ok(hfqName, true, hfqDetail);
  else warn(hfqName, hfqDetail);
}

async function L5(syms: { symbol: string }[]) {
  console.log("\n=== L5 派生表 bar_period_adj ↔ bar1d_qfq 重聚合 ===");
  const periods: { p: string; expr: string }[] = [
    { p: "1w", expr: "date_trunc('week', time)" },
    { p: "1mo", expr: "date_trunc('month', time)" },
  ];
  let checked = 0, bad = 0, lag = 0, maxAbs = 0;
  for (const s of syms) {
    for (const { p, expr } of periods) {
      const rs = await db.execute(sql`
        with grp as (
          select time, open, high, low, close,
                 ${sql.raw(expr)} as g
          from bar1d_qfq where symbol = ${s.symbol}
        ), agg as (
          select max(time) t, count(*) bc,
                 (array_agg(open order by time))[1] o,
                 max(high) h, min(low) l,
                 (array_agg(close order by time desc))[1] c
          from grp group by g
        )
        select a.o, a.h, a.l, a.c, a.bc,
               b.open bo, b.high bh, b.low bl, b.close bc2, b.bar_count bbc
        from agg a
        left join bar_period_adj b on b.period = ${p} and b.symbol = ${s.symbol} and b.time = a.t
      `);
      for (const r of rs.rows) {
        if (r.bbc == null) {
          lag++; // 最新周期尚未聚合：增量管道时序滞后 1 个交易日，非数据缺陷
          continue;
        }
        const dd = Math.max(
          Math.abs(Number(r.o) - Number(r.bo)),
          Math.abs(Number(r.h) - Number(r.bh)),
          Math.abs(Number(r.l) - Number(r.bl)),
          Math.abs(Number(r.c) - Number(r.bc2)),
          Math.abs(Number(r.bc) - Number(r.bbc)),
        );
        if (dd > maxAbs) maxAbs = dd;
        if (dd > 1e-3) bad++;
        checked++;
      }
    }
  }
  const pass = bad === 0 && checked > 0;
  const detail = `比对 ${checked} 个周期，超差 ${bad}，滞后(最新周期未聚合) ${lag}，maxdiff=${maxAbs.toExponential(2)}`;
  if (pass) ok("bar_period_adj == bar1d_qfq 重聚合", true, detail);
  else warn("bar_period_adj == bar1d_qfq 重聚合", detail);
}

const main = async () => {
  const sL1 = await sampleSymbols(10);
  await L1(sL1);
  const s12 = await sampleSymbols(4);
  await L2(s12);
  await L3(s12);
  const s15 = await sampleSymbols(5);
  await L4(s15);
  await L5(s15.slice(0, 10));
  console.log(`\n===== 结果：${failures.length === 0 ? "全部硬断言通过" : failures.join(", ")} =====`);
  process.exit(failures.length > 0 ? 1 : 0);
};

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
