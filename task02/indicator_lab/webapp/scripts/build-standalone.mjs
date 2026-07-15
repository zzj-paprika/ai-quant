import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = resolve(root, "standalone-dist", "index.html");
let html = await readFile(htmlPath, "utf8");

const stylesheet = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);
if (stylesheet) {
  const cssPath = resolve(root, "standalone-dist", stylesheet[1].replace(/^\.\//, ""));
  const css = await readFile(cssPath, "utf8");
  html = html.replace(stylesheet[0], () => `<style>${css}</style>`);
}

const script = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/);
if (!script) throw new Error("未找到构建后的 JavaScript");
const scriptPath = resolve(root, "standalone-dist", script[1].replace(/^\.\//, ""));
const javascript = await readFile(scriptPath, "utf8");
const safeJavascript = javascript.replace(/<\/script/gi, (match) => "<" + String.fromCharCode(92) + match.slice(1));
html = html.replace(script[0], "");
const errorGuard = `<script>window.addEventListener("error",function(event){var root=document.getElementById("root");if(root){root.textContent="页面载入失败："+event.message;root.style.cssText="padding:24px;font-family:system-ui;color:#b53d42"}});window.addEventListener("unhandledrejection",function(event){var root=document.getElementById("root");if(root){root.textContent="页面载入失败："+(event.reason&&event.reason.message?event.reason.message:String(event.reason));root.style.cssText="padding:24px;font-family:system-ui;color:#b53d42"}});</script>`;
html = html.replace("</body>", () => `${errorGuard}<script>${safeJavascript}</script></body>`);

const output = resolve(root, "..", "indicator_lab.html");
await writeFile(output, html, "utf8");
console.log(output);
