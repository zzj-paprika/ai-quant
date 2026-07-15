export type PriceRow = {
  code: string;
  date: Date;
  dateLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  preClose: number;
  volume: number;
  adjustment: string;
  source: string;
};

export type RSIResult = { values: Array<number | null> };
export type MACDResult = {
  emaFast: Array<number | null>;
  emaSlow: Array<number | null>;
  dif: Array<number | null>;
  dea: Array<number | null>;
  hist: Array<number | null>;
};
export type BollResult = {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  width: Array<number | null>;
  pctB: Array<number | null>;
};
export type ATRResult = {
  tr: number[];
  atr: Array<number | null>;
  atrPct: Array<number | null>;
};

const number = (value: string | undefined) => Number(value ?? "");

export function parseCsv(text: string, fallbackAdjustment = "未知", fallbackSource = "上传文件"): PriceRow[] {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV 至少需要表头和一行数据");
  const headers = lines[0].split(",").map((item) => item.trim());
  const required = ["trade_date", "open", "high", "low", "close"];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join(", ")}`);

  const index = Object.fromEntries(headers.map((header, i) => [header, i]));
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",").map((item) => item.trim());
    const rawDate = cells[index.trade_date] ?? "";
    const compact = rawDate.replaceAll("-", "").replaceAll("/", "");
    if (!/^\d{8}$/.test(compact)) return null;
    const date = new Date(`${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T00:00:00`);
    const open = number(cells[index.open]);
    const high = number(cells[index.high]);
    const low = number(cells[index.low]);
    const close = number(cells[index.close]);
    if (![open, high, low, close].every(Number.isFinite) || high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
    return {
      code: index.ts_code === undefined ? "CUSTOM" : cells[index.ts_code],
      date,
      dateLabel: `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`,
      open,
      high,
      low,
      close,
      preClose: index.pre_close === undefined ? close : number(cells[index.pre_close]),
      volume: index.vol === undefined ? 0 : number(cells[index.vol]),
      adjustment: index.adjustment === undefined ? fallbackAdjustment : cells[index.adjustment] || fallbackAdjustment,
      source: index.source === undefined ? fallbackSource : cells[index.source] || fallbackSource,
    } satisfies PriceRow;
  }).filter((row): row is PriceRow => row !== null);

  rows.sort((a, b) => a.date.getTime() - b.date.getTime());
  const unique = rows.filter((row, i) => i === 0 || row.dateLabel !== rows[i - 1].dateLabel);
  if (unique.length < 2) throw new Error("没有足够的有效行情数据");
  return unique;
}

function ema(values: Array<number | null>, period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  const alpha = 2 / (period + 1);
  let current: number | null = null;
  let count = 0;
  values.forEach((value, i) => {
    if (value === null || !Number.isFinite(value)) return;
    current = current === null ? value : alpha * value + (1 - alpha) * current;
    count += 1;
    if (count >= period) result[i] = current;
  });
  return result;
}

export function calculateRSI(rows: PriceRow[], period: number): RSIResult {
  const values: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length <= period) return { values };
  const gains = Array(rows.length).fill(0);
  const losses = Array(rows.length).fill(0);
  for (let i = 1; i < rows.length; i += 1) {
    const delta = rows[i].close - rows[i - 1].close;
    gains[i] = Math.max(delta, 0);
    losses[i] = Math.max(-delta, 0);
  }
  let avgGain = gains.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  const score = () => avgGain === 0 && avgLoss === 0 ? 50 : avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss);
  values[period] = score();
  for (let i = period + 1; i < rows.length; i += 1) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    values[i] = score();
  }
  return { values };
}

export function calculateMACD(rows: PriceRow[], fast: number, slow: number, signal: number, scale: number): MACDResult {
  const closes = rows.map((row) => row.close);
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const dif = closes.map((_, i) => emaFast[i] === null || emaSlow[i] === null ? null : emaFast[i]! - emaSlow[i]!);
  const dea = ema(dif, signal);
  const hist = dif.map((value, i) => value === null || dea[i] === null ? null : scale * (value - dea[i]!));
  return { emaFast, emaSlow, dif, dea, hist };
}

export function calculateBoll(rows: PriceRow[], period: number, multiplier: number): BollResult {
  const mid: Array<number | null> = Array(rows.length).fill(null);
  const upper: Array<number | null> = Array(rows.length).fill(null);
  const lower: Array<number | null> = Array(rows.length).fill(null);
  const width: Array<number | null> = Array(rows.length).fill(null);
  const pctB: Array<number | null> = Array(rows.length).fill(null);
  for (let i = period - 1; i < rows.length; i += 1) {
    const window = rows.slice(i - period + 1, i + 1).map((row) => row.close);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period);
    const up = mean + multiplier * std;
    const low = mean - multiplier * std;
    mid[i] = mean;
    upper[i] = up;
    lower[i] = low;
    width[i] = mean === 0 ? null : (up - low) / mean * 100;
    pctB[i] = up === low ? null : (rows[i].close - low) / (up - low);
  }
  return { mid, upper, lower, width, pctB };
}

export function calculateATR(rows: PriceRow[], period: number): ATRResult {
  const tr = rows.map((row, i) => {
    if (i === 0) return row.high - row.low;
    const previous = rows[i - 1].close;
    return Math.max(row.high - row.low, Math.abs(row.high - previous), Math.abs(row.low - previous));
  });
  const atr: Array<number | null> = Array(rows.length).fill(null);
  if (rows.length >= period) {
    let current = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
    atr[period - 1] = current;
    for (let i = period; i < rows.length; i += 1) {
      current = (current * (period - 1) + tr[i]) / period;
      atr[i] = current;
    }
  }
  const atrPct = atr.map((value, i) => value === null || rows[i].close === 0 ? null : value / rows[i].close * 100);
  return { tr, atr, atrPct };
}

export function lastValue(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) if (values[i] !== null) return values[i];
  return null;
}

export function percentile(values: Array<number | null>, latest: number | null, lookback = 120): number | null {
  if (latest === null) return null;
  const valid = values.slice(-lookback).filter((value): value is number => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.filter((value) => value <= latest).length / valid.length * 100;
}
