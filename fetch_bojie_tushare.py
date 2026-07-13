"""Download one year of Bojie Technology daily data from Tushare and build a local dashboard."""
from __future__ import annotations

import csv
import json
import urllib.request
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / ".codex" / "config.toml"
OUT = ROOT / "data"
SYMBOL = "002975.SZ"


def tushare_token() -> str:
    for line in CONFIG.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("url") and "token=" in line:
            return line.split("token=", 1)[1].split("&", 1)[0].strip().strip('"')
    raise RuntimeError("Tushare MCP token was not found in .codex/config.toml")


def fetch_daily(token: str, start: date, end: date) -> list[dict]:
    body = json.dumps({
        "api_name": "daily",
        "token": token,
        "params": {"ts_code": SYMBOL, "start_date": start.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")},
        "fields": "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount",
    }).encode("utf-8")
    request = urllib.request.Request("https://api.tushare.pro", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = json.load(response)
    if payload.get("code") != 0:
        raise RuntimeError(f"Tushare returned {payload.get('code')}: {payload.get('msg')}")
    fields = payload["data"]["fields"]
    rows = [dict(zip(fields, row)) for row in payload["data"]["items"]]
    return sorted(rows, key=lambda item: item["trade_date"])


def write_dashboard(rows: list[dict]) -> None:
    data = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    html = f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>博杰股份｜近一年交易看板</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#09111f;color:#e7edf8;font-family:system-ui,"Microsoft YaHei",sans-serif}}main{{max-width:1440px;margin:auto;padding:28px 22px}}h1{{margin:0;font-size:28px}}.sub{{color:#93a4bd;margin:8px 0 24px}}.stats{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}}.card,.panel{{background:#101c30;border:1px solid #20314c;border-radius:14px}}.card{{padding:15px}}.label{{font-size:12px;color:#90a1ba}}.value{{font-size:22px;font-weight:700;margin-top:7px}}.panel{{padding:16px;margin-top:16px}}.panel h2{{font-size:16px;margin:0 0 12px}}canvas{{width:100%;display:block;background:#0c1728;border-radius:9px}}#price{{height:440px}}#volume{{height:190px}}.tip{{min-height:20px;color:#bed0e9;font-size:13px;margin:8px 2px 0}}@media(max-width:700px){{main{{padding:18px 12px}}.stats{{grid-template-columns:repeat(2,1fr)}}#price{{height:330px}}}}
</style></head><body><main><h1>博杰股份 <span style="color:#66b7ff">002975.SZ</span></h1><p class="sub" id="range">近一年日线交易价格与成交量</p><section class="stats" id="stats"></section><section class="panel"><h2>K 线图（鼠标移动查看数据）</h2><canvas id="price"></canvas><div class="tip" id="tip"></div></section><section class="panel"><h2>成交量（手）</h2><canvas id="volume"></canvas></section></main>
<script>const rows={data};
const fmt=n=>Number(n).toLocaleString('zh-CN',{{maximumFractionDigits:2}});const cnDate=s=>s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8);
const first=rows[0],last=rows.at(-1),hi=Math.max(...rows.map(x=>+x.high)),lo=Math.min(...rows.map(x=>+x.low)),total=rows.reduce((s,x)=>s+(+x.vol),0);
document.querySelector('#range').textContent=`${{cnDate(first.trade_date)}} 至 ${{cnDate(last.trade_date)}} · ${{rows.length}} 个交易日`;
document.querySelector('#stats').innerHTML=[['最新收盘',fmt(last.close)],['期间涨跌',`${{(+last.close/+first.pre_close-1)*100>=0?'+':''}}${{((+last.close/+first.pre_close-1)*100).toFixed(2)}}%`],['区间最高',fmt(hi)],['累计成交量',fmt(total)]].map(x=>`<div class="card"><div class="label">${{x[0]}}</div><div class="value">${{x[1]}}</div></div>`).join('');
function setup(id){{const c=document.getElementById(id),d=devicePixelRatio||1,r=c.getBoundingClientRect();c.width=r.width*d;c.height=r.height*d;const x=c.getContext('2d');x.scale(d,d);return [x,r.width,r.height]}}
function grid(ctx,w,h,min,max,pad){{ctx.strokeStyle='#20314c';ctx.fillStyle='#91a3bc';ctx.font='12px system-ui';ctx.lineWidth=1;for(let i=0;i<5;i++){{let y=pad+(h-pad*2)*i/4,v=max-(max-min)*i/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke();ctx.fillText(v.toFixed(2),3,y+4)}}}}
function drawPrice(){{const [c,w,h]=setup('price'),pad=48,min=lo-(hi-lo)*.05,max=hi+(hi-lo)*.05,iw=w-pad*2,step=iw/rows.length;grid(c,w,h,min,max,pad);const Y=v=>pad+(max-v)/(max-min)*(h-pad*2);rows.forEach((d,i)=>{{const x=pad+i*step,up=+d.close>=+d.open;c.strokeStyle=c.fillStyle=up?'#f26476':'#35c798';c.beginPath();c.moveTo(x,Y(+d.high));c.lineTo(x,Y(+d.low));c.stroke();const y=Math.min(Y(+d.open),Y(+d.close)),bh=Math.max(1,Math.abs(Y(+d.open)-Y(+d.close)));c.fillRect(x-step*.32,y,Math.max(1,step*.64),bh)}});return {{pad,step,Y,w,h}}}}
function drawVol(){{const [c,w,h]=setup('volume'),pad=48,maxV=Math.max(...rows.map(x=>+x.vol))*1.08,step=(w-pad*2)/rows.length;c.strokeStyle='#20314c';for(let i=0;i<3;i++){{let y=pad+(h-pad*2)*i/2;c.beginPath();c.moveTo(pad,y);c.lineTo(w-pad,y);c.stroke()}}rows.forEach((d,i)=>{{const bh=(+d.vol/maxV)*(h-pad*2);c.fillStyle=+d.close>=+d.open?'#f26476':'#35c798';c.fillRect(pad+i*step,h-pad-bh,Math.max(1,step*.65),bh)}})}}
let layout;function draw(){{layout=drawPrice();drawVol()}}draw();addEventListener('resize',draw);document.getElementById('price').addEventListener('mousemove',e=>{{const r=e.currentTarget.getBoundingClientRect(),i=Math.max(0,Math.min(rows.length-1,Math.floor((e.clientX-r.left-layout.pad)/layout.step))),d=rows[i];document.getElementById('tip').textContent=`${{cnDate(d.trade_date)}}  开 ${{d.open}} · 高 ${{d.high}} · 低 ${{d.low}} · 收 ${{d.close}} · 成交量 ${{fmt(d.vol)}} 手`;}});
</script></body></html>'''
    (OUT / "bojie_dashboard.html").write_text(html, encoding="utf-8")


def main() -> None:
    OUT.mkdir(exist_ok=True)
    end = date.today()
    start = end - timedelta(days=365)
    rows = fetch_daily(tushare_token(), start, end)
    if not rows:
        raise RuntimeError("Tushare returned no trading data for the requested period")
    fields = list(rows[0])
    with (OUT / "bojie_002975_sz_daily.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)
    (OUT / "bojie_002975_sz_daily.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    write_dashboard(rows)
    print(f"Saved {len(rows)} trading days: {rows[0]['trade_date']} to {rows[-1]['trade_date']}")


if __name__ == "__main__":
    main()
