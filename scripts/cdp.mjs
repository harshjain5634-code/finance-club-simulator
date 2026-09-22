// Minimal Chrome DevTools Protocol driver shared by the browser scripts (no extra dependencies).
// Start a headless Chrome first:
//   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9333 --user-data-dir=/tmp/finsim-smoke about:blank
import { writeFileSync } from "node:fs";

export const PORT = Number(process.env.CDP_PORT ?? 9333);
export const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Page helpers injected after every navigation, so scripts can drive the UI by visible text. */
export const helpers = `
  window.__scope = (scope) => (scope === "dialog" ? [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].pop() : document);
  window.__click = (text, scope) => {
    const root = __scope(scope);
    if (!root) return false;
    const candidates = [...root.querySelectorAll("button, a")].filter((el) => el.textContent.replace(/\\s+/g, " ").trim().includes(text) && !el.disabled);
    const el = candidates[candidates.length - 1];
    if (!el) return false;
    el.click();
    return true;
  };
  window.__clickExact = (text, scope) => {
    const root = __scope(scope);
    if (!root) return false;
    const el = [...root.querySelectorAll("button, a, [role=radio], [role=tab]")].find((node) => node.textContent.replace(/\\s+/g, " ").trim() === text && !node.disabled);
    if (!el) return false;
    el.click();
    return true;
  };
  window.__clickLabel = (label, scope) => {
    const root = __scope(scope) ?? document;
    const el = root.querySelector(\`[aria-label="\${label}"]\`);
    if (!el || el.disabled) return false;
    el.click();
    return true;
  };
  window.__key = (key) => { window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); return true; };
  window.__store = () => JSON.parse(localStorage.getItem("finsim:store"));
  window.__demo = () => window.__store().events["demo-event"];
  window.__setInput = (selector, value) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  };
  window.__stageLabel = () => document.querySelector('[aria-label^="Projector:"]')?.getAttribute("aria-label") ?? "";
  /** Interactive elements below the 24px WCAG 2.2 target minimum. */
  window.__smallTargets = () => [...document.querySelectorAll("button, a, [role=button], input, [role=tab], [role=radio], [role=switch]")]
    .filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && s.visibility !== "hidden" && el.getAttribute("aria-label") !== "Skip to main content"; })
    .map((el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30) }; })
    .filter((x) => (x.h < 24 || x.w < 24) && !(x.w <= 1 && x.h <= 1))
    .slice(0, 6);
  window.__overflow = () => document.documentElement.scrollWidth - document.documentElement.clientWidth;
  /** Elements wider than the viewport: the usual cause of horizontal scrolling. */
  window.__wideNodes = () => [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().width > document.documentElement.clientWidth + 1 && getComputedStyle(el).position !== "fixed")
    .slice(0, 6)
    .map((el) => \`\${el.tagName.toLowerCase()}.\${String(el.className).split(" ").slice(0, 3).join(".")}\`);
  true;
`;

export class Tab {
  constructor(name, wsUrl, sink) {
    this.name = name;
    this.id = 0;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
    this.sink = sink;
    sink.errors[name] ??= [];
    this.ready = new Promise((resolve) => (this.ws.onopen = resolve));
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      } else if (msg.method === "Runtime.exceptionThrown") {
        this.record(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
        this.record(`[${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description).join(" "));
      }
    };
  }
  record(message) {
    // React dev-only notices that say nothing about this app.
    if (/Download the React DevTools/i.test(message)) return;
    this.sink.errors[this.name].push({ at: this.currentPath ?? "", message: String(message).slice(0, 400) });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
  async init(width = 1440, height = 900) {
    await this.ready;
    await this.send("Runtime.enable");
    await this.send("Page.enable");
    // Keep background tabs "focused" so the leader-tab scheduler is not throttled.
    await this.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await this.resize(width, height);
  }
  async resize(width, height) {
    this.viewport = { width, height };
    const mobile = width < 500;
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    // Touch emulation also flips `pointer: coarse`, which some hit-area rules depend on.
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  }
  async eval(expression) {
    const res = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.result?.exceptionDetails) throw new Error(`${this.name} eval failed: ${res.result.exceptionDetails.text} :: ${expression.slice(0, 120)}`);
    return res.result?.result?.value;
  }
  async go(path, settle = 900) {
    this.currentPath = path;
    await this.send("Page.navigate", { url: BASE + path });
    await this.waitFor(`document.readyState === "complete"`, 15000);
    await sleep(settle);
    await this.eval(helpers);
  }
  async waitFor(expression, timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (await this.eval(`Boolean(${expression})`)) return true;
      } catch {}
      await sleep(200);
    }
    return false;
  }
  text() {
    return this.eval(`document.body.innerText`);
  }
  async shot(dir, label) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    const file = `${dir}/${label}.png`;
    writeFileSync(file, Buffer.from(res.result.data, "base64"));
    return file;
  }
}

export async function openTab(name, path, width, height, sink) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + path)}`, { method: "PUT" });
  const target = await res.json();
  const tab = new Tab(name, target.webSocketDebuggerUrl, sink);
  await tab.init(width, height);
  await tab.go(path);
  return tab;
}
