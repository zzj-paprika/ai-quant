"""Static and data-integrity checks for the standalone dashboard."""

from __future__ import annotations

import json
import re
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent
HTML = ROOT / "dual_ma_dashboard.html"


def main() -> None:
    text = HTML.read_text(encoding="utf-8")
    assert "/*__STOCK_DATA__*/" not in text
    assert "fetch(" not in text
    assert HTML.stat().st_size < 2_000_000

    match = re.search(r"const STOCKS=(\{.*?\});\n\s*\(\(\)=>", text, re.S)
    assert match, "Embedded STOCKS payload not found"
    stocks = json.loads(match.group(1))
    assert set(stocks) == {"002975.SZ", "002594.SZ", "688981.SH", "600900.SH"}

    source_paths = {
        "002975.SZ": ROOT.parent / "data" / "bojie_002975_sz_daily.csv",
        "002594.SZ": ROOT.parent / "data" / "biyadi_002594_sz_daily.csv",
        "688981.SH": ROOT.parent / "data" / "zhongxin_guoji_688981_sh_daily.csv",
        "600900.SH": ROOT.parent / "data" / "changjiang_dianli_600900_sh_daily.csv",
    }

    for code, stock in stocks.items():
        bars = stock["bars"]
        assert len(bars) >= 200, f"{code}: too few rows"
        dates = [bar["d"] for bar in bars]
        assert dates == sorted(dates), f"{code}: dates not sorted"
        assert len(dates) == len(set(dates)), f"{code}: duplicate dates"
        assert stock["adjustment"] == "前复权（收益口径）"

        with source_paths[code].open(encoding="utf-8-sig", newline="") as handle:
            raw_rows = sorted(csv.DictReader(handle), key=lambda row: row["trade_date"])
        raw_last = raw_rows[-1]
        raw_last_date = raw_last["trade_date"]
        expected_date = f"{raw_last_date[:4]}-{raw_last_date[4:6]}-{raw_last_date[6:8]}"
        assert dates[-1] == expected_date, f"{code}: embedded data is stale"
        assert abs(bars[-1]["c"] - float(raw_last["close"])) < 1e-6, (
            f"{code}: latest adjusted close must equal latest traded close"
        )
        for bar in bars:
            assert bar["o"] > 0 and bar["h"] > 0 and bar["l"] > 0 and bar["c"] > 0
            assert bar["h"] >= max(bar["o"], bar["l"], bar["c"])
            assert bar["l"] <= min(bar["o"], bar["h"], bar["c"])

    required_ids = [
        "stock", "fast", "slow", "start", "end", "fee",
        "rsi-on", "rsi-period", "rsi-max", "tp-on", "tp",
        "sl-on", "sl", "reverse-on", "capital", "price-chart",
        "equity-chart", "drawdown-chart", "monthly-chart", "sharpe-chart",
        "zoom-reset", "zoom-label", "zoom-slider-row", "time-slider",
        "slider-range", "trades",
    ]
    for element_id in required_ids:
        assert f'id="{element_id}"' in text, f"Missing element #{element_id}"

    for label in ["总收益率", "年化收益率", "最大回撤", "夏普比率", "胜率", "盈亏比", "超额收益"]:
        assert label in text

    assert "addEventListener('wheel'" in text
    assert "$('time-slider').addEventListener('input'" in text
    assert "passive:false" in text
    assert "addEventListener('dblclick'" in text
    assert "concat(r.signals.map(signal=>signal.price))" in text
    assert "ctx.moveTo(px,py);ctx.lineTo(px-6,py+11)" in text
    assert "ctx.moveTo(px,py);ctx.lineTo(px-6,py-11)" in text
    assert ".findLastIndex(" not in text
    assert ".at(-1)" not in text
    assert "页面初始化失败" in text

    print(f"Dashboard checks passed: {len(stocks)} stocks, {HTML.stat().st_size / 1024:.1f} KiB")


if __name__ == "__main__":
    main()
