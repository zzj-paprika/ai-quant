"use client";

import { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ATRResult,
  BollResult,
  MACDResult,
  PriceRow,
  RSIResult,
  calculateATR,
  calculateBoll,
  calculateMACD,
  calculateRSI,
  lastValue,
  parseCsv,
  percentile,
} from "./indicators";
import bojieCsv from "../public/data/bojie_qfq.csv?raw";
import bydCsv from "../public/data/biyadi_raw.csv?raw";
import changjiangCsv from "../public/data/changjiang_raw.csv?raw";
import smicCsv from "../public/data/zhongxin_raw.csv?raw";

type IndicatorKey = "rsi" | "macd" | "boll" | "atr";
type Params = {
  rsi: { period: number; overbought: number; oversold: number };
  macd: { fast: number; slow: number; signal: number; scale: number };
  boll: { period: number; multiplier: number };
  atr: { period: number; distance: number };
};

const DEFAULT_PARAMS: Params = {
  rsi: { period: 14, overbought: 70, oversold: 30 },
  macd: { fast: 12, slow: 26, signal: 9, scale: 2 },
  boll: { period: 20, multiplier: 2 },
  atr: { period: 14, distance: 2 },
};

const DATASETS = [
  { id: "bojie", name: "博杰股份", code: "002975.SZ", csv: bojieCsv, adjustment: "前复权 QFQ", source: "东方财富" },
  { id: "byd", name: "比亚迪", code: "002594.SZ", csv: bydCsv, adjustment: "未复权", source: "Tushare" },
  { id: "changjiang", name: "长江电力", code: "600900.SH", csv: changjiangCsv, adjustment: "未复权", source: "Tushare" },
  { id: "smic", name: "中芯国际", code: "688981.SH", csv: smicCsv, adjustment: "未复权", source: "Tushare" },
];

const DETAILS: Record<IndicatorKey, { title: string; formula: string; meaning: string; reading: string; limit: string }> = {
  rsi: {
    title: "RSI 代表什么？",
    formula: "RSI = 100 − 100 / (1 + 平均涨幅 ÷ 平均跌幅)",
    meaning: "RSI 是 0–100 之间的动量震荡指标。它比较最近 N 个交易日的平均上涨幅度与平均下跌幅度，回答的是“近期买方与卖方哪一边推动价格的力量更强”，而不是股票估值是否便宜。",
    reading: "常见阈值是 70 与 30：70 以上进入超买观察区，30 以下进入超卖观察区，50 附近表示涨跌动量相对均衡。除了绝对位置，还应观察 RSI 的方向以及它是否与价格同步。",
    limit: "强趋势中 RSI 可以长时间停留在高位或低位。超买不等于马上下跌，超卖也不等于马上反弹；周期越短越敏感，同时噪声越多。",
  },
  macd: {
    title: "MACD 代表什么？",
    formula: "DIF = EMA(快) − EMA(慢)；DEA = EMA(DIF, 信号周期)",
    meaning: "MACD 同时观察趋势和动量。DIF 衡量短期价格均线相对长期均线的距离，DEA 对 DIF 再次平滑，柱值展示两者差距，从而描述趋势力量正在增强还是减弱。",
    reading: "DIF、DEA 在零轴上方通常表示中期价格重心偏强，在零轴下方表示偏弱。DIF 上穿 DEA 的当天称为金叉，下穿称为死叉；柱值扩大表示两条线的距离正在扩大。",
    limit: "MACD 建立在移动平均之上，因此天然滞后。横盘时可能反复交叉并产生假信号；DIF 当前高于 DEA 只描述相对位置，不代表当天刚发生金叉。",
  },
  boll: {
    title: "布林带代表什么？",
    formula: "中轨 = SMA(N)；上下轨 = 中轨 ± K × 标准差",
    meaning: "布林带同时描述价格中枢与近期波动范围。中轨是移动平均，上下轨由滚动标准差决定，因此波动扩大时轨道变宽，波动降低时轨道收窄；%B 表示价格在轨道中的相对位置。",
    reading: "价格靠近上轨表示处于近期分布上沿，靠近下轨表示处于下沿。带宽收缩说明波动被压缩，扩张说明波动正在释放；还要观察价格是否持续沿某一侧轨道运行。",
    limit: "触碰上轨不必然超买，触碰下轨也不必然超卖。强趋势中价格可以沿轨运行；“收口”只说明波动降低，无法单独判断下一次突破方向。",
  },
  atr: {
    title: "ATR 代表什么？",
    formula: "TR = max(高−低, |高−前收|, |低−前收|)；ATR = Wilder 平滑",
    meaning: "ATR 是纯波动率指标。真实波幅同时考虑日内高低差和隔夜跳空，因此 ATR 越大，近期单日价格活动范围通常越大。ATR% 用 ATR 除以收盘价，便于跨股票比较。",
    reading: "ATR 上升表示波动扩大，下降表示波动收敛。ATR 使用价格单位，ATR% 使用百分比；若干倍 ATR 可以作为风险距离的参考表达，但不是固定止损答案。",
    limit: "ATR 不包含方向信息，上涨和下跌都可能使它增大。实际风险控制还必须考虑仓位、流动性、跳空、滑点和个人承受能力。",
  },
};

const fmt = (value: number | null, digits = 2) => value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

function setupCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function colors() {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    text: get("--ink", "#152019"), muted: get("--muted", "#6e7b73"), grid: get("--line", "#dce5df"),
    up: get("--up", "#d94a4a"), down: get("--down", "#188a63"), primary: get("--primary", "#1d6a4b"),
    secondary: get("--secondary", "#d28a32"), violet: get("--violet", "#7857a6"), background: get("--paper", "#f7f8f4"),
  };
}

function line(ctx: CanvasRenderingContext2D, values: Array<number | null>, x: (i: number) => number, y: (v: number) => number, stroke: string, width = 1.7) {
  ctx.beginPath();
  let started = false;
  values.forEach((value, i) => {
    if (value === null || !Number.isFinite(value)) { started = false; return; }
    if (!started) ctx.moveTo(x(i), y(value)); else ctx.lineTo(x(i), y(value));
    started = true;
  });
  ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
}

function PriceChart({ rows, boll, showBoll, hover, onHover }: { rows: PriceRow[]; boll: BollResult; showBoll: boolean; hover: number | null; onHover: (index: number | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !rows.length) return;
    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas); const c = colors();
      const left = 54, right = 14, top = 14, bottom = 28, plotW = width - left - right, plotH = height - top - bottom;
      const lows = rows.map((r) => r.low), highs = rows.map((r) => r.high);
      const min = Math.min(...lows), max = Math.max(...highs), pad = Math.max((max - min) * .06, max * .005);
      const y = (v: number) => top + (max + pad - v) / (max - min + 2 * pad) * plotH;
      const x = (i: number) => left + (i + .5) / rows.length * plotW;
      ctx.clearRect(0, 0, width, height); ctx.font = "12px system-ui"; ctx.textBaseline = "middle";
      for (let i = 0; i < 5; i += 1) {
        const gy = top + plotH * i / 4, value = max + pad - (max - min + 2 * pad) * i / 4;
        ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(width - right, gy); ctx.stroke();
        ctx.fillStyle = c.muted; ctx.fillText(value.toFixed(2), 4, gy);
      }
      if (showBoll) {
        line(ctx, boll.upper, x, y, c.secondary, 1.2); line(ctx, boll.mid, x, y, c.violet, 1.2); line(ctx, boll.lower, x, y, c.secondary, 1.2);
      }
      const candleW = Math.max(1, Math.min(9, plotW / rows.length * .64));
      rows.forEach((row, i) => {
        const cx = x(i), up = row.close >= row.open, color = up ? c.up : c.down;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, y(row.high)); ctx.lineTo(cx, y(row.low)); ctx.stroke();
        const bodyTop = Math.min(y(row.open), y(row.close)), bodyHeight = Math.max(1.5, Math.abs(y(row.open) - y(row.close)));
        ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyHeight);
      });
      if (hover !== null && rows[hover]) {
        const hx = x(hover); ctx.strokeStyle = c.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, height - bottom); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = c.muted; ctx.textAlign = "left"; ctx.fillText(rows[0].dateLabel.slice(0, 7), left, height - 10);
      ctx.textAlign = "right"; ctx.fillText(rows.at(-1)!.dateLabel.slice(0, 7), width - right, height - 10);
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect();
  }, [rows, boll, showBoll, hover]);
  const pointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), left = 54, right = 14;
    const ratio = (event.clientX - rect.left - left) / (rect.width - left - right);
    onHover(ratio < 0 || ratio > 1 ? null : Math.max(0, Math.min(rows.length - 1, Math.floor(ratio * rows.length))));
  };
  return <canvas ref={ref} className="price-canvas" onPointerMove={pointer} onPointerLeave={() => onHover(null)} aria-label="日 K 线图，红涨绿跌" />;
}

function IndicatorChart({ kind, rows, rsi, macd, boll, atr, params, hover, onHover }: { kind: IndicatorKey; rows: PriceRow[]; rsi: RSIResult; macd: MACDResult; boll: BollResult; atr: ATRResult; params: Params; hover: number | null; onHover: (index: number | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !rows.length) return;
    const draw = () => {
      const { ctx, width, height } = setupCanvas(canvas), c = colors();
      const left = 54, right = 14, top = 12, bottom = 24, plotW = width - left - right, plotH = height - top - bottom;
      const x = (i: number) => left + (i + .5) / rows.length * plotW;
      let series: Array<number | null>[] = [], min = 0, max = 100, labels: number[] = [];
      if (kind === "rsi") { series = [rsi.values]; min = 0; max = 100; labels = [params.rsi.overbought, 50, params.rsi.oversold]; }
      if (kind === "macd") { series = [macd.dif, macd.dea, macd.hist]; const valid = series.flat().filter((v): v is number => v !== null); const extent = Math.max(...valid.map(Math.abs), .01); min = -extent * 1.18; max = extent * 1.18; labels = [0]; }
      if (kind === "boll") { series = [boll.width]; const valid = boll.width.filter((v): v is number => v !== null); min = 0; max = Math.max(...valid, 1) * 1.12; labels = [];
      }
      if (kind === "atr") { series = [atr.atrPct]; const valid = atr.atrPct.filter((v): v is number => v !== null); min = 0; max = Math.max(...valid, 1) * 1.12; labels = []; }
      const y = (v: number) => top + (max - v) / (max - min || 1) * plotH;
      ctx.clearRect(0, 0, width, height); ctx.font = "12px system-ui"; ctx.textBaseline = "middle";
      for (let i = 0; i < 4; i += 1) {
        const gy = top + plotH * i / 3, value = max - (max - min) * i / 3;
        ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(width - right, gy); ctx.stroke();
        ctx.fillStyle = c.muted; ctx.textAlign = "right"; ctx.fillText(value.toFixed(kind === "rsi" ? 0 : 2), left - 7, gy);
      }
      labels.forEach((value) => { ctx.strokeStyle = c.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(left, y(value)); ctx.lineTo(width - right, y(value)); ctx.stroke(); ctx.setLineDash([]); });
      if (kind === "macd") {
        const barW = Math.max(1, plotW / rows.length * .58); macd.hist.forEach((value, i) => { if (value === null) return; ctx.fillStyle = value >= 0 ? c.up : c.down; const zero = y(0), vy = y(value); ctx.fillRect(x(i) - barW / 2, Math.min(zero, vy), barW, Math.max(1, Math.abs(vy - zero))); });
        line(ctx, macd.dif, x, y, c.primary); line(ctx, macd.dea, x, y, c.secondary);
      } else line(ctx, series[0], x, y, kind === "boll" ? c.secondary : kind === "atr" ? c.violet : c.primary, 2);
      if (hover !== null && rows[hover]) { const hx = x(hover); ctx.strokeStyle = c.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx, height - bottom); ctx.stroke(); ctx.setLineDash([]); }
    };
    draw(); const observer = new ResizeObserver(draw); observer.observe(canvas); return () => observer.disconnect();
  }, [kind, rows, rsi, macd, boll, atr, params, hover]);
  const pointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(), left = 54, right = 14;
    const ratio = (event.clientX - rect.left - left) / (rect.width - left - right);
    onHover(ratio < 0 || ratio > 1 ? null : Math.max(0, Math.min(rows.length - 1, Math.floor(ratio * rows.length))));
  };
  return <canvas ref={ref} className="indicator-canvas" onPointerMove={pointer} onPointerLeave={() => onHover(null)} aria-label={`${kind.toUpperCase()} 指标图`} />;
}

function NumberControl({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="control-field"><span><b>{label}</b><output>{value}</output></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export default function IndicatorLab() {
  const [datasetId, setDatasetId] = useState("bojie");
  const [datasetName, setDatasetName] = useState("博杰股份");
  const [datasetCode, setDatasetCode] = useState("002975.SZ");
  const [dataMeta, setDataMeta] = useState({ adjustment: "前复权 QFQ", source: "东方财富" });
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [range, setRange] = useState("1y");
  const [active, setActive] = useState<IndicatorKey>("rsi");
  const [multi, setMulti] = useState(false);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [hover, setHover] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("indicator-lab-params");
    if (saved) { try { setParams(JSON.parse(saved)); } catch { /* ignore invalid local preference */ } }
  }, []);
  useEffect(() => { localStorage.setItem("indicator-lab-params", JSON.stringify(params)); }, [params]);

  useEffect(() => {
    const dataset = DATASETS.find((item) => item.id === datasetId); if (!dataset || datasetId === "upload") return;
    setLoading(true); setError("");
    try {
      setRows(parseCsv(dataset.csv, dataset.adjustment, dataset.source)); setDatasetName(dataset.name); setDatasetCode(dataset.code); setDataMeta({ adjustment: dataset.adjustment, source: dataset.source });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法读取数据"); }
    setLoading(false);
  }, [datasetId]);

  const visibleRows = useMemo(() => {
    const count = range === "3m" ? 66 : range === "6m" ? 132 : range === "1y" ? 250 : rows.length;
    return rows.slice(-count);
  }, [rows, range]);
  const rsi = useMemo(() => calculateRSI(visibleRows, params.rsi.period), [visibleRows, params.rsi.period]);
  const macd = useMemo(() => calculateMACD(visibleRows, params.macd.fast, params.macd.slow, params.macd.signal, params.macd.scale), [visibleRows, params.macd]);
  const boll = useMemo(() => calculateBoll(visibleRows, params.boll.period, params.boll.multiplier), [visibleRows, params.boll]);
  const atr = useMemo(() => calculateATR(visibleRows, params.atr.period), [visibleRows, params.atr.period]);
  const latest = visibleRows.at(-1) ?? null;
  const focus = hover === null ? latest : visibleRows[hover];
  const rsiValue = lastValue(rsi.values), dif = lastValue(macd.dif), dea = lastValue(macd.dea), hist = lastValue(macd.hist);
  const pctB = lastValue(boll.pctB), width = lastValue(boll.width), atrValue = lastValue(atr.atr), atrPct = lastValue(atr.atrPct);
  const widthPctile = percentile(boll.width, width), atrPctile = percentile(atr.atrPct, atrPct);

  const rsiState = rsiValue === null ? "数据不足" : rsiValue >= params.rsi.overbought ? "超买观察区" : rsiValue <= params.rsi.oversold ? "超卖观察区" : rsiValue >= 50 ? "中性偏强" : "中性偏弱";
  const macdState = dif === null || dea === null ? "数据不足" : `${dif >= dea ? "DIF 高于 DEA" : "DIF 低于 DEA"}，${dif >= 0 ? "零轴上方" : "零轴下方"}`;
  const bollState = pctB === null ? "数据不足" : pctB > 1 ? "突破上轨" : pctB < 0 ? "跌破下轨" : pctB >= .5 ? "带内上部" : "带内下部";
  const atrState = atrPctile === null ? "数据不足" : atrPctile >= 80 ? "相对波动较高" : atrPctile <= 20 ? "相对波动较低" : "相对波动中等";

  const currentReadout = focus ? `开 ${focus.open.toFixed(2)}　高 ${focus.high.toFixed(2)}　低 ${focus.low.toFixed(2)}　收 ${focus.close.toFixed(2)}` : "";
  const activeSummary = active === "rsi" ? `RSI(${params.rsi.period}) ${fmt(rsiValue)} · ${rsiState}` : active === "macd" ? `MACD 柱 ${fmt(hist)} · ${macdState}` : active === "boll" ? `%B ${fmt(pctB)} · 带宽 ${fmt(width)}%` : `ATR ${fmt(atrValue)} · ATR% ${fmt(atrPct)}%`;

  const combined = `${rsiState.includes("强") || rsiState.includes("超买") ? "RSI 显示近期动量偏强" : "RSI 尚未显示明显强势动量"}；MACD ${dif !== null && dea !== null && dif > dea ? "的 DIF 位于 DEA 上方" : "的 DIF 未高于 DEA"}，价格${bollState.includes("上") ? "处在布林带偏上位置" : "处在布林带偏下位置"}。同时 ATR% ${atrState.replace("相对波动", "处于相对") }，因此当前组合更适合描述为“${dif !== null && dea !== null && dif > dea ? "趋势偏强" : "趋势信号有限"}、${atrPctile !== null && atrPctile >= 80 ? "但风险较高" : "波动风险可控"}”，不能直接等同于买入或卖出信号。`;

  const updateParam = <K extends IndicatorKey>(key: K, field: keyof Params[K], value: number) => setParams((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  const resetActive = () => setParams((current) => ({ ...current, [active]: DEFAULT_PARAMS[active] } as Params));

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const parsed = parseCsv(await file.text(), "口径未知", "本地上传");
      setRows(parsed); setDatasetId("upload"); setDatasetName(file.name.replace(/\.csv$/i, "")); setDatasetCode(parsed[0].code || "CUSTOM");
      setDataMeta({ adjustment: parsed[0].adjustment || "口径未知", source: parsed[0].source || "本地上传" }); setError(""); setRange("all");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "CSV 解析失败"); }
    event.target.value = "";
  };

  const indicators: IndicatorKey[] = multi ? ["rsi", "macd", "boll", "atr"] : [active];
  return <main className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">IL</span><div><strong>Indicator Lab</strong><small>多股票技术指标实验室</small></div></div>
      <div className="toolbar">
        <label><span>股票 / 数据集</span><select value={datasetId} onChange={(event) => setDatasetId(event.target.value)}>{DATASETS.map((item) => <option key={item.id} value={item.id}>{item.code.slice(0, 6)}　{item.name}</option>)}{datasetId === "upload" && <option value="upload">{datasetName}</option>}</select></label>
        <label><span>时间范围</span><select value={range} onChange={(event) => setRange(event.target.value)}><option value="3m">近 3 月</option><option value="6m">近 6 月</option><option value="1y">近 1 年</option><option value="all">全部</option></select></label>
        <label className="upload-button"><input type="file" accept=".csv,text/csv" onChange={upload} /><span>上传 CSV</span></label>
      </div>
    </header>

    <section className="data-strip" aria-label="数据状态">
      <span className="status-pill">{dataMeta.adjustment}</span><span>{visibleRows[0]?.dateLabel ?? "—"} — {latest?.dateLabel ?? "—"}</span><span>{visibleRows.length} 个交易日</span><span>来源：{dataMeta.source}</span>
    </section>
    {error && <div className="error-banner" role="alert">{error}</div>}

    <nav className="indicator-tabs" aria-label="指标选择">
      {(["rsi", "macd", "boll", "atr"] as IndicatorKey[]).map((key) => <button key={key} className={active === key ? "active" : ""} onClick={() => setActive(key)}>{key === "boll" ? "布林带" : key.toUpperCase()}</button>)}
      <label className="switch"><input type="checkbox" checked={multi} onChange={(event) => setMulti(event.target.checked)} /><span>多指标模式</span></label>
    </nav>

    <section className="workspace">
      <div className="visual-column">
        <div className="chart-heading"><div><h1>{datasetName} <span>{datasetCode}</span></h1><div className="quote">¥{latest?.close.toFixed(2) ?? "—"}<small>截至 {latest?.dateLabel ?? "—"}</small></div></div><div className="readout"><strong>{activeSummary}</strong><span>{focus?.dateLabel ?? ""}　{currentReadout}</span></div></div>
        {loading ? <div className="loading">正在读取行情数据…</div> : visibleRows.length ? <>
          <PriceChart rows={visibleRows} boll={boll} showBoll={active === "boll" || multi} hover={hover} onHover={setHover} />
          {indicators.map((kind) => <div className="indicator-chart-block" key={kind}><div className="chart-label">{kind === "boll" ? "布林带宽度" : kind === "atr" ? "ATR%" : kind.toUpperCase()}</div><IndicatorChart kind={kind} rows={visibleRows} rsi={rsi} macd={macd} boll={boll} atr={atr} params={params} hover={hover} onHover={setHover} /></div>)}
          <div className="chart-foot"><span>红涨绿跌 · 影线表示最高/最低价</span><span>移动指针可同步查看 K 线与指标值</span></div>
        </> : null}
      </div>

      <aside className="parameter-panel">
        <div className="panel-head"><div><small>当前指标</small><h2>{active === "boll" ? "布林带" : active.toUpperCase()} 参数</h2></div><button onClick={resetActive}>恢复默认</button></div>
        <div className="controls">
          {active === "rsi" && <><NumberControl label="周期 N" value={params.rsi.period} min={2} max={100} onChange={(v) => updateParam("rsi", "period", v)} /><NumberControl label="超买阈值" value={params.rsi.overbought} min={params.rsi.oversold + 1} max={95} onChange={(v) => updateParam("rsi", "overbought", v)} /><NumberControl label="超卖阈值" value={params.rsi.oversold} min={5} max={params.rsi.overbought - 1} onChange={(v) => updateParam("rsi", "oversold", v)} /></>}
          {active === "macd" && <><NumberControl label="快线周期" value={params.macd.fast} min={2} max={Math.min(100, params.macd.slow - 1)} onChange={(v) => updateParam("macd", "fast", v)} /><NumberControl label="慢线周期" value={params.macd.slow} min={params.macd.fast + 1} max={200} onChange={(v) => updateParam("macd", "slow", v)} /><NumberControl label="信号周期" value={params.macd.signal} min={2} max={100} onChange={(v) => updateParam("macd", "signal", v)} /><label className="select-control"><span><b>柱值倍率</b></span><select value={params.macd.scale} onChange={(e) => updateParam("macd", "scale", Number(e.target.value))}><option value="2">2（国内常见）</option><option value="1">1（海外常见）</option></select></label></>}
          {active === "boll" && <><NumberControl label="中轨周期" value={params.boll.period} min={2} max={200} onChange={(v) => updateParam("boll", "period", v)} /><NumberControl label="标准差倍数 K" value={params.boll.multiplier} min={.5} max={5} step={.1} onChange={(v) => updateParam("boll", "multiplier", v)} /><div className="fixed-setting"><span>标准差口径</span><strong>总体标准差 · ddof=0</strong></div></>}
          {active === "atr" && <><NumberControl label="周期 N" value={params.atr.period} min={2} max={100} onChange={(v) => updateParam("atr", "period", v)} /><NumberControl label="风险距离倍数" value={params.atr.distance} min={.5} max={5} step={.5} onChange={(v) => updateParam("atr", "distance", v)} /><div className="fixed-setting"><span>平滑方式</span><strong>Wilder Smoothing</strong></div></>}
        </div>
        <div className="quick-result"><small>最新结果</small><strong>{activeSummary}</strong><p>{active === "rsi" ? `当前处于${rsiState}，应同时观察 RSI 的方向和价格趋势。` : active === "macd" ? `${macdState}。交叉信号只在发生穿越的当天成立。` : active === "boll" ? `价格位于${bollState}，带宽处于近 120 日约 ${fmt(widthPctile, 0)}% 分位。` : `${atrState}；${params.atr.distance} 倍 ATR 的价格距离约为 ${fmt(atrValue === null ? null : atrValue * params.atr.distance)} 元。`}</p></div>
      </aside>
    </section>

    <section className="explanation">
      <div className="section-title"><div><small>指标说明</small><h2>{DETAILS[active].title}</h2></div><code>{DETAILS[active].formula}</code></div>
      <div className="explain-grid"><article><h3>它在衡量什么</h3><p>{DETAILS[active].meaning}</p></article><article><h3>怎样读这个数值</h3><p>{DETAILS[active].reading}</p></article><article><h3>使用时要注意</h3><p>{DETAILS[active].limit}</p></article></div>
    </section>

    <section className="summary-section">
      <div className="section-title"><div><small>当前参数 · 最新有效值</small><h2>四项指标汇总</h2></div><span>{latest?.dateLabel ?? "—"}</span></div>
      <div className="summary-grid"><article><small>RSI({params.rsi.period}) · 动量</small><strong>{fmt(rsiValue)}</strong><span>{rsiState}</span></article><article><small>MACD({params.macd.fast},{params.macd.slow},{params.macd.signal}) · 趋势</small><strong>柱值 {fmt(hist)}</strong><span>{macdState}</span></article><article><small>BOLL({params.boll.period},{params.boll.multiplier}) · 价格位置</small><strong>%B {fmt(pctB)}</strong><span>{bollState} · 带宽 {fmt(width)}%</span></article><article><small>ATR({params.atr.period}) · 波动风险</small><strong>ATR% {fmt(atrPct)}%</strong><span>{atrState}</span></article></div>
      <p className="combined"><b>联合解读：</b>{combined}</p>
    </section>
    <footer>技术指标实验室仅用于研究与学习，不构成投资建议。前复权历史价格可能随新的公司行动发生变化。</footer>
  </main>;
}
