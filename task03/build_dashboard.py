"""Build the standalone dual-moving-average backtest dashboard."""

from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parent
TEMPLATE = ROOT / "dashboard_template.html"
OUTPUT = ROOT / "dual_ma_dashboard.html"

SOURCES = {
    "002975.SZ": {
        "name": "博杰股份",
        "path": WORKSPACE / "data" / "bojie_002975_sz_daily.csv",
        "mode": "forward_return_adjusted",
        "label": "前复权（收益口径）",
    },
    "002594.SZ": {
        "name": "比亚迪",
        "path": WORKSPACE / "data" / "biyadi_002594_sz_daily.csv",
        "mode": "forward_return_adjusted",
        "label": "前复权（收益口径）",
    },
    "688981.SH": {
        "name": "中芯国际",
        "path": WORKSPACE / "data" / "zhongxin_guoji_688981_sh_daily.csv",
        "mode": "forward_return_adjusted",
        "label": "前复权（收益口径）",
    },
    "600900.SH": {
        "name": "长江电力",
        "path": WORKSPACE / "data" / "changjiang_dianli_600900_sh_daily.csv",
        "mode": "forward_return_adjusted",
        "label": "前复权（收益口径）",
    },
}


def read_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Missing source data: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    rows.sort(key=lambda row: row["trade_date"])
    return rows


def build_records(rows: list[dict[str, str]], mode: str) -> list[dict[str, float | str]]:
    records: list[dict[str, float | str]] = []
    adjusted_closes: list[float] | None = None
    if mode == "forward_return_adjusted":
        # Rebuild a continuous return series backwards so the latest adjusted
        # close equals the latest traded close.  pct_chg is based on the
        # exchange-adjusted pre_close, so corporate-action gaps are removed.
        adjusted_closes = [0.0] * len(rows)
        adjusted_closes[-1] = float(rows[-1]["close"])
        for index in range(len(rows) - 1, 0, -1):
            daily_return = float(rows[index]["pct_chg"]) / 100.0
            adjusted_closes[index - 1] = adjusted_closes[index] / (1.0 + daily_return)

    for index, row in enumerate(rows):
        raw_close = float(row["close"])
        if mode == "adjusted":
            factor = 1.0
        else:
            if adjusted_closes is None:
                raise ValueError(f"Unsupported adjustment mode: {mode}")
            factor = adjusted_closes[index] / raw_close

        date = str(row["trade_date"])
        date = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
        records.append(
            {
                "d": date,
                "o": round(float(row["open"]) * factor, 4),
                "h": round(float(row["high"]) * factor, 4),
                "l": round(float(row["low"]) * factor, 4),
                "c": round(raw_close * factor, 4),
                "v": round(float(row.get("vol") or 0), 2),
            }
        )
    return records


def main() -> None:
    payload: dict[str, dict[str, object]] = {}
    for code, source in SOURCES.items():
        rows = read_rows(source["path"])
        records = build_records(rows, source["mode"])
        payload[code] = {
            "code": code,
            "name": source["name"],
            "adjustment": source["label"],
            "start": records[0]["d"],
            "end": records[-1]["d"],
            "bars": records,
        }

    template = TEMPLATE.read_text(encoding="utf-8")
    marker = "/*__STOCK_DATA__*/"
    if marker not in template:
        raise RuntimeError(f"Missing marker {marker} in {TEMPLATE}")
    embedded = "const STOCKS=" + json.dumps(
        payload, ensure_ascii=False, separators=(",", ":")
    ) + ";"
    OUTPUT.write_text(template.replace(marker, embedded), encoding="utf-8")
    print(f"Built {OUTPUT} ({OUTPUT.stat().st_size / 1024:.1f} KiB)")
    for stock in payload.values():
        print(
            f"  {stock['code']} {stock['name']}: "
            f"{len(stock['bars'])} rows, {stock['start']} to {stock['end']}"
        )


if __name__ == "__main__":
    main()
