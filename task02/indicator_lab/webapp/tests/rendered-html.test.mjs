import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders Indicator Lab instead of the starter", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Indicator Lab/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("ships the four-indicator application and bundled datasets", async () => {
  const [component, indicators] = await Promise.all([
    readFile(new URL("../app/IndicatorLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/indicators.ts", import.meta.url), "utf8"),
  ]);
  for (const label of ["RSI", "MACD", "布林带", "ATR", "四项指标汇总", "联合解读"]) assert.match(component, new RegExp(label));
  for (const fn of ["calculateRSI", "calculateMACD", "calculateBoll", "calculateATR"]) assert.match(indicators, new RegExp(`function ${fn}`));
  await Promise.all([
    access(new URL("../public/data/bojie_qfq.csv", import.meta.url)),
    access(new URL("../public/data/biyadi_raw.csv", import.meta.url)),
    access(new URL("../public/data/changjiang_raw.csv", import.meta.url)),
    access(new URL("../public/data/zhongxin_raw.csv", import.meta.url)),
  ]);
});
